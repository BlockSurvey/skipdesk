/**
 * Knowledge-base document endpoints (session-gated). The business is resolved
 * from the logged-in owner — never from the URL/body — preserving tenant isolation.
 *
 * Upload stores the blob in R2, records a `documents` row (status=processing),
 * and ingests inline via ctx.waitUntil: toMarkdown → chunk → embed → kb_chunks →
 * status=ready. A failed ingest sets status=failed + the reason, and drops any
 * partial chunks so a failed doc never serves half its content.
 *
 *   POST   /api/me/documents          multipart upload (field: file, optional title)
 *   GET    /api/me/documents          list this business's documents
 *   GET    /api/me/documents/:id      one document (status poll)
 *   DELETE /api/me/documents/:id      delete doc + its chunks + the R2 blob
 *   POST   /api/me/knowledge/search   { query, topK? } → KB hits (owner test box)
 */
import { and, desc, eq } from 'drizzle-orm'

import { createDb } from '../../../db/client'
import type { Document } from '../../../db/schema'
import { documents, kbChunks } from '../../../db/schema'
import { chunkMarkdown, embedTexts, searchKnowledgeBase } from './lib/knowledge'
import { resolveAuth, sessionToken, type AuthedUser } from './lib/session'

type Env = { DB: D1Database; JWT_PRIVATE_JWK: string; DOCS: R2Bucket; AI: Ai }
type Db = ReturnType<typeof createDb>

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS })

const MAX_DOC_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED: Record<string, true> = {
  'application/pdf': true,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true, // .docx
  'text/plain': true,
  'text/markdown': true,
}
// Some browsers send octet-stream / empty type for .md/.txt — fall back on extension.
const extOk = (name: string) => /\.(pdf|docx|txt|md|markdown)$/i.test(name)

async function requireSession(db: Db, env: Env, request: Request): Promise<AuthedUser | Response> {
  const me = await resolveAuth(db, env, sessionToken(request))
  if (!me) return json({ error: 'not authenticated' }, 401)
  if (!me.business) return json({ error: 'no business yet — complete onboarding first' }, 409)
  return me
}

const view = (d: Document) => ({
  id: d.id,
  filename: d.filename,
  title: d.title,
  content_type: d.contentType,
  size_bytes: d.sizeBytes,
  status: d.status,
  error: d.error,
  chunk_count: d.chunkCount,
  created_at: d.createdAt,
  updated_at: d.updatedAt,
})

export async function handleDocumentsApi(
  request: Request,
  env: Env,
  url: URL,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const db = createDb(env.DB)
  const me = await requireSession(db, env, request)
  if (me instanceof Response) return me
  const bizId = me.business!.id
  const path = url.pathname

  // ── POST /api/me/documents (multipart upload) ──
  if (path === '/api/me/documents' && request.method === 'POST') {
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return json({ error: 'expected multipart/form-data with a "file" field' }, 400)
    }
    // workers-types models FormData.get() as `string | null`, but a file part is
    // a File at runtime — guard by duck-typing the Blob, then narrow.
    const entry = form.get('file') as unknown
    if (!entry || typeof entry === 'string' || typeof (entry as Blob).arrayBuffer !== 'function') {
      return json({ error: 'missing "file"' }, 400)
    }
    const file = entry as File
    if (file.size === 0) return json({ error: 'file is empty' }, 400)
    if (file.size > MAX_DOC_BYTES) return json({ error: 'file exceeds 10 MB limit' }, 413)
    const type = file.type || 'application/octet-stream'
    if (!ALLOWED[type] && !extOk(file.name)) {
      return json({ error: 'unsupported type — use PDF, DOCX, TXT, or Markdown' }, 415)
    }
    const title = (form.get('title') as string | null)?.trim() || null

    const id = crypto.randomUUID()
    const r2Key = `documents/${bizId}/${id}/${file.name}`
    const bytes = await file.arrayBuffer()
    await env.DOCS.put(r2Key, bytes, { httpMetadata: { contentType: type } })

    const [doc] = await db
      .insert(documents)
      .values({
        id,
        businessId: bizId,
        filename: file.name,
        title,
        contentType: type,
        sizeBytes: file.size,
        r2Key,
        status: 'processing',
        uploadedBy: me.user.id,
      })
      .returning()

    ctx.waitUntil(ingest(env, db, doc!))
    return json({ document: view(doc!) }, 201)
  }

  // ── GET /api/me/documents ──
  if (path === '/api/me/documents' && request.method === 'GET') {
    const rows = await db.query.documents.findMany({
      where: eq(documents.businessId, bizId),
      orderBy: desc(documents.createdAt),
    })
    return json({ documents: rows.map(view) })
  }

  // ── POST /api/me/knowledge/search (owner-facing test box) ──
  if (path === '/api/me/knowledge/search' && request.method === 'POST') {
    const b = (await request.json().catch(() => null)) as { query?: string; topK?: number } | null
    if (!b?.query?.trim()) return json({ error: 'expected { query }' }, 400)
    const hits = await searchKnowledgeBase(db, env.AI, bizId, b.query, Math.min(b.topK ?? 5, 10))
    return json({ hits })
  }

  // ── /api/me/documents/:id ──
  const m = /^\/api\/me\/documents\/([^/]+)$/.exec(path)
  if (m) {
    const docId = m[1]!
    const doc = await db.query.documents.findFirst({
      where: and(eq(documents.id, docId), eq(documents.businessId, bizId)),
    })
    if (!doc) return json({ error: 'not found' }, 404)
    if (request.method === 'GET') return json({ document: view(doc) })
    if (request.method === 'DELETE') {
      await db.delete(kbChunks).where(eq(kbChunks.documentId, docId))
      await db.delete(documents).where(and(eq(documents.id, docId), eq(documents.businessId, bizId)))
      await env.DOCS.delete(doc.r2Key).catch(() => {})
      return json({ ok: true })
    }
  }

  return json({ error: 'not found' }, 404)
}

/** Inline ingestion: convert → chunk → embed → store. Failures are recorded. */
async function ingest(env: Env, db: Db, doc: Document): Promise<void> {
  try {
    const obj = await env.DOCS.get(doc.r2Key)
    if (!obj) throw new Error('uploaded file not found in storage')
    const blob = await obj.blob()
    const conv = (await env.AI.toMarkdown([{ name: doc.filename, blob }])) as
      | { data: string }
      | { data: string }[]
    const markdown = Array.isArray(conv) ? conv.map((d) => d.data).join('\n\n') : conv.data
    const chunks = chunkMarkdown(markdown)
    if (chunks.length === 0) throw new Error('no extractable text')
    const vectors = await embedTexts(env.AI, chunks)
    const rows = chunks.map((text, i) => ({
      businessId: doc.businessId,
      documentId: doc.id,
      chunkIndex: i,
      text,
      embedding: vectors[i]!,
      charCount: text.length,
    }))
    // D1 caps a statement at 100 bound parameters. Each row binds 8 columns
    // (id, business_id, document_id, chunk_index, text, embedding, char_count,
    // created_at), so insert in batches of 10 (≈80 params) to stay well under it.
    const INSERT_BATCH = 10
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      await db.insert(kbChunks).values(rows.slice(i, i + INSERT_BATCH))
    }
    await db
      .update(documents)
      .set({ status: 'ready', chunkCount: chunks.length, error: null, updatedAt: new Date().toISOString() })
      .where(eq(documents.id, doc.id))
  } catch (e) {
    await db.delete(kbChunks).where(eq(kbChunks.documentId, doc.id))
    await db
      .update(documents)
      .set({
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(documents.id, doc.id))
  }
}
