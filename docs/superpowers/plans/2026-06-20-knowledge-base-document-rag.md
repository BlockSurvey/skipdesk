# Knowledge Base — Document Upload + RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each business upload documents (PDF/DOCX/TXT/MD) that get stored in Cloudflare R2, converted + chunked + embedded into D1, and searchable by the voice agent via a new `search_knowledge_base` MCP tool.

**Architecture:** Additive feature over the existing shared `db/` data layer. Two new D1 tables (`documents`, `kb_chunks`); R2 holds raw blobs; Workers AI does `toMarkdown` conversion + `bge` embeddings; brute-force cosine search in the Worker; session-gated `/api/me/documents*` routes for the dashboard; one new MCP tool. Tenant isolation by `business_id` from the authenticated principal, enforced on every query — unchanged rule.

**Tech Stack:** Cloudflare Workers + D1 (Drizzle sqlite-core) + R2 + Workers AI (`@cf/baai/bge-base-en-v1.5`, `toMarkdown`); Next.js 14 App Router + Tailwind; `@modelcontextprotocol/sdk`.

## Global Constraints

- **D1 only for the database.** Vectors live in D1 (`kb_chunks.embedding` as JSON). R2 = blobs, Workers AI = compute. This is the single documented deviation; no other store.
- **Tenant isolation:** every query filters `business_id` from the authenticated principal (session user or API key) — never from URL/body. No cross-tenant query path.
- **Composite indexes lead with `business_id`.**
- **Schema is the source of truth:** edit `db/schema.ts` → `npm run db:generate` (never hand-edit migration SQL) → `npm run d1:migrate`.
- **Column conventions:** TEXT UUIDv4 PKs (`crypto.randomUUID()`), ISO-8601 UTC TEXT timestamps, booleans INTEGER 0/1, enums TEXT + CHECK from `db/enums.ts`, JSON TEXT via `mode:'json'`.
- **Embedding model is a single constant** (`EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'`) reused by ingest + search so they can't drift.
- **Never run a dev server to verify** (shared `.next` corruption). Verify by `npm run typecheck` + e2e tests.
- **MCP tools** are plain `ToolDef`s registered via `createRegistrar`; they appear on `/mcp` + `/sse` automatically.
- Commit messages end with the repo's Co-Authored-By + Claude-Session trailer.

---

### Task 1: Schema, enums, scopes, migration

**Files:**
- Modify: `db/enums.ts` (add `DOCUMENT_STATUSES`, two scopes)
- Modify: `db/schema.ts` (add `documents`, `kb_chunks`, relations, types)
- Modify: `workers/mcp/src/register.ts` + `workers/mcp/src/account.ts` (default key scopes — they use `[...API_SCOPES]`, so new scopes flow automatically; verify)
- Generate: `db/migrations/*` via `npm run db:generate`

**Interfaces:**
- Produces: `documents` table (`id, businessId, filename, title, contentType, sizeBytes, r2Key, status, error, chunkCount, uploadedBy, createdAt, updatedAt`), `kb_chunks` table (`id, businessId, documentId, chunkIndex, text, embedding, charCount, createdAt`); types `Document`, `NewDocument`, `KbChunk`, `NewKbChunk`; enum `DOCUMENT_STATUSES`; scopes `knowledge:read`, `knowledge:write`.

- [ ] **Step 1:** In `db/enums.ts`, add after `APPOINTMENT_STATUSES`:
```ts
export const DOCUMENT_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]
```
And add `'knowledge:read'`, `'knowledge:write'` to the `API_SCOPES` array.

- [ ] **Step 2:** In `db/schema.ts`, import `DOCUMENT_STATUSES`, then add the two tables (after `appointments`):
```ts
// ── documents — uploaded knowledge-base files (one row per file) ─────────────
export const documents = sqliteTable(
  'documents',
  {
    id: pk(),
    businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    title: text('title'),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    r2Key: text('r2_key').notNull(),
    status: text('status').notNull().default('processing'),
    error: text('error'),
    chunkCount: integer('chunk_count').notNull().default(0),
    uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    businessCreatedIdx: index('idx_documents_business_created').on(t.businessId, t.createdAt),
    businessStatusIdx: index('idx_documents_business_status').on(t.businessId, t.status),
    statusCk: check('ck_documents_status', oneOf(t.status, DOCUMENT_STATUSES)),
  }),
)

// ── kb_chunks — one row per chunk + embedding (vectors live in D1) ───────────
export const kbChunks = sqliteTable(
  'kb_chunks',
  {
    id: pk(),
    businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    text: text('text').notNull(),
    embedding: text('embedding', { mode: 'json' }).$type<number[]>().notNull(),
    charCount: integer('char_count'),
    createdAt: createdAt(),
  },
  (t) => ({
    businessIdx: index('idx_kb_chunks_business').on(t.businessId),
    documentIdx: index('idx_kb_chunks_document').on(t.documentId),
  }),
)
```

- [ ] **Step 3:** Add relations + `businessesRelations` entry + inferred types:
```ts
export const documentsRelations = relations(documents, ({ one, many }) => ({
  business: one(businesses, { fields: [documents.businessId], references: [businesses.id] }),
  uploader: one(users, { fields: [documents.uploadedBy], references: [users.id] }),
  chunks: many(kbChunks),
}))
export const kbChunksRelations = relations(kbChunks, ({ one }) => ({
  business: one(businesses, { fields: [kbChunks.businessId], references: [businesses.id] }),
  document: one(documents, { fields: [kbChunks.documentId], references: [documents.id] }),
}))
```
Add `documents: many(documents)` to `businessesRelations`. Add types:
```ts
export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
export type KbChunk = typeof kbChunks.$inferSelect
export type NewKbChunk = typeof kbChunks.$inferInsert
```

- [ ] **Step 4:** Generate the migration:
```bash
npm run db:generate
```
Expected: a new file under `db/migrations/` creating both tables. Inspect it; do not hand-edit.

- [ ] **Step 5:** Apply to remote D1:
```bash
npm run d1:migrate
```
Expected: both tables created on `skip-desk-db`.

- [ ] **Step 6:** Typecheck + commit:
```bash
npm run typecheck && git add db/ workers/mcp/ && git commit -m "KB: documents + kb_chunks tables, statuses, knowledge scopes"
```

---

### Task 2: Worker infra bindings (R2 + AI)

**Files:**
- Modify: `workers/mcp/wrangler.toml` (R2 + AI bindings)
- Modify: `workers/mcp/src/index.ts` (extend `Env`)
- Run: `wrangler r2 bucket create skip-desk-docs`

**Interfaces:**
- Produces: `Env.DOCS: R2Bucket`, `Env.AI: Ai` available to all worker code.

- [ ] **Step 1:** Create the bucket:
```bash
npx wrangler r2 bucket create skip-desk-docs
```

- [ ] **Step 2:** Append to `workers/mcp/wrangler.toml`:
```toml
# R2 — raw uploaded knowledge-base document blobs (namespaced by business_id in the key).
[[r2_buckets]]
binding = "DOCS"
bucket_name = "skip-desk-docs"

# Workers AI — document→markdown conversion (toMarkdown) + text embeddings (bge).
[ai]
binding = "AI"
```

- [ ] **Step 3:** In `workers/mcp/src/index.ts`, extend the `Env` type:
```ts
export type Env = {
  DB: D1Database
  MCP_OBJECT: DurableObjectNamespace
  JWT_PRIVATE_JWK: string
  DOCS: R2Bucket
  AI: Ai
}
```

- [ ] **Step 4:** Typecheck + commit:
```bash
npm run typecheck && git add workers/mcp/ && git commit -m "KB: add R2 (DOCS) + Workers AI (AI) bindings"
```

---

### Task 3: RAG core — `src/lib/knowledge.ts`

**Files:**
- Create: `workers/mcp/src/lib/knowledge.ts`

**Interfaces:**
- Produces:
  - `EMBEDDING_MODEL: string`, `EMBEDDING_DIMS = 768`
  - `chunkMarkdown(md: string): string[]`
  - `embedTexts(ai: Ai, texts: string[]): Promise<number[][]>`
  - `cosineSimilarity(a: number[], b: number[]): number`
  - `searchKnowledgeBase(db, ai, businessId, query, topK?, minScore?): Promise<{ text; score; documentId; filename }[]>`

- [ ] **Step 1:** Create `workers/mcp/src/lib/knowledge.ts`:
```ts
/**
 * Knowledge-base RAG core: chunk → embed → cosine search, all tenant-scoped.
 * Vectors live in D1 (kb_chunks.embedding as JSON); search is brute-force cosine
 * over the tenant's chunks. ONE embedding model constant is shared by ingest and
 * search so the query and the corpus can never be embedded differently.
 */
import { eq, inArray } from 'drizzle-orm'

import type { Db } from '../../../../db/client'
import { documents, kbChunks } from '../../../../db/schema'

export const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'
export const EMBEDDING_DIMS = 768

const CHUNK_CHARS = 1000
const CHUNK_OVERLAP = 150

/** Split markdown into ~1k-char chunks on paragraph boundaries, with overlap. */
export function chunkMarkdown(md: string): string[] {
  const clean = md.replace(/\r\n/g, '\n').trim()
  if (!clean) return []
  const paras = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let buf = ''
  for (const p of paras) {
    if (buf && buf.length + p.length + 2 > CHUNK_CHARS) {
      chunks.push(buf)
      buf = buf.slice(Math.max(0, buf.length - CHUNK_OVERLAP))
    }
    buf = buf ? `${buf}\n\n${p}` : p
    // A single oversized paragraph: hard-split it.
    while (buf.length > CHUNK_CHARS) {
      chunks.push(buf.slice(0, CHUNK_CHARS))
      buf = buf.slice(CHUNK_CHARS - CHUNK_OVERLAP)
    }
  }
  if (buf.trim()) chunks.push(buf.trim())
  return chunks.map((c) => c.trim()).filter(Boolean)
}

function normalize(v: number[]): number[] {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => x / n)
}

/** Embed texts with the shared model (batched), returning normalized vectors. */
export async function embedTexts(ai: Ai, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const out: number[][] = []
  // Workers AI accepts an array; batch to stay within request limits.
  const BATCH = 50
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH)
    const res = (await ai.run(EMBEDDING_MODEL, { text: slice })) as { data: number[][] }
    for (const v of res.data) out.push(normalize(v))
  }
  return out
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) dot += a[i]! * b[i]!
  return dot // inputs are normalized → dot product == cosine
}

export type KbHit = { text: string; score: number; documentId: string; filename: string }

/** Embed the query, score it against the tenant's chunks, return top-K. */
export async function searchKnowledgeBase(
  db: Db,
  ai: Ai,
  businessId: string,
  query: string,
  topK = 5,
  minScore = 0.2,
): Promise<KbHit[]> {
  const q = query.trim()
  if (!q) return []
  const [qVec] = await embedTexts(ai, [q])
  if (!qVec) return []
  const rows = await db.query.kbChunks.findMany({
    where: eq(kbChunks.businessId, businessId),
    columns: { text: true, embedding: true, documentId: true },
  })
  if (rows.length === 0) return []
  const docIds = [...new Set(rows.map((r) => r.documentId))]
  const docs = await db.query.documents.findMany({
    where: inArray(documents.id, docIds),
    columns: { id: true, filename: true, title: true },
  })
  const nameById = new Map(docs.map((d) => [d.id, d.title || d.filename]))
  return rows
    .map((r) => ({
      text: r.text,
      score: cosineSimilarity(qVec, r.embedding as number[]),
      documentId: r.documentId,
      filename: nameById.get(r.documentId) ?? 'document',
    }))
    .filter((h) => h.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
```

- [ ] **Step 2:** Typecheck + commit:
```bash
npm run typecheck && git add workers/mcp/src/lib/knowledge.ts && git commit -m "KB: RAG core (chunk/embed/cosine/search)"
```

---

### Task 4: Ingestion + document routes — `src/documents.ts`

**Files:**
- Create: `workers/mcp/src/documents.ts`
- Modify: `workers/mcp/src/index.ts` (route `/api/me/documents*` + `/api/me/knowledge/search`; pass `ctx`)

**Interfaces:**
- Consumes: `searchKnowledgeBase`, `chunkMarkdown`, `embedTexts`, `EMBEDDING_MODEL` (Task 3); `resolveAuth`, `sessionToken` (session.ts); `documents`, `kbChunks` (schema).
- Produces: `handleDocumentsApi(request, env, url, ctx): Promise<Response>` mounted in `index.ts`.

- [ ] **Step 1:** Create `workers/mcp/src/documents.ts`:
```ts
/**
 * Knowledge-base document endpoints (session-gated). The business is resolved
 * from the logged-in owner — never from the URL/body. Upload stores the blob in
 * R2, records a `documents` row (status=processing), and ingests inline via
 * ctx.waitUntil: toMarkdown → chunk → embed → kb_chunks → status=ready.
 *
 *   POST   /api/me/documents          multipart upload (field: file, optional title)
 *   GET    /api/me/documents          list this business's documents
 *   GET    /api/me/documents/:id      one document (status poll)
 *   DELETE /api/me/documents/:id      delete doc + its chunks + the R2 blob
 *   POST   /api/me/knowledge/search   { query, topK? } → KB hits (owner test box)
 */
import { and, desc, eq } from 'drizzle-orm'

import { createDb } from '../../../db/client'
import { documents, kbChunks } from '../../../db/schema'
import { resolveAuth, sessionToken, type AuthedUser } from './lib/session'
import { chunkMarkdown, embedTexts, searchKnowledgeBase } from './lib/knowledge'

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

const view = (d: typeof documents.$inferSelect) => ({
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
    const file = form.get('file')
    if (!(file instanceof File)) return json({ error: 'missing "file"' }, 400)
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

  // ── /api/me/knowledge/search ──
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
async function ingest(env: Env, db: Db, doc: typeof documents.$inferSelect): Promise<void> {
  try {
    const obj = await env.DOCS.get(doc.r2Key)
    if (!obj) throw new Error('uploaded file not found in storage')
    const blob = await obj.blob()
    const md = (await env.AI.toMarkdown([{ name: doc.filename, blob }])) as
      | { data: string }
      | { data: string }[]
    const markdown = Array.isArray(md) ? md.map((d) => d.data).join('\n\n') : md.data
    const chunks = chunkMarkdown(markdown)
    if (chunks.length === 0) throw new Error('no extractable text')
    const vectors = await embedTexts(env.AI, chunks)
    await db.insert(kbChunks).values(
      chunks.map((text, i) => ({
        businessId: doc.businessId,
        documentId: doc.id,
        chunkIndex: i,
        text,
        embedding: vectors[i]!,
        charCount: text.length,
      })),
    )
    await db
      .update(documents)
      .set({ status: 'ready', chunkCount: chunks.length, error: null, updatedAt: new Date().toISOString() })
      .where(eq(documents.id, doc.id))
  } catch (e) {
    await db.delete(kbChunks).where(eq(kbChunks.documentId, doc.id))
    await db
      .update(documents)
      .set({ status: 'failed', error: e instanceof Error ? e.message : String(e), updatedAt: new Date().toISOString() })
      .where(eq(documents.id, doc.id))
  }
}
```

- [ ] **Step 2:** In `workers/mcp/src/index.ts`, import and route (before the generic `/api/me` handler so the more specific paths win):
```ts
import { handleDocumentsApi } from './documents'
// ...inside fetch(), before the `if (url.pathname.startsWith('/api/me'))` block:
if (url.pathname.startsWith('/api/me/documents') || url.pathname === '/api/me/knowledge/search') {
  return handleDocumentsApi(request, env, url, ctx)
}
```

- [ ] **Step 3:** Typecheck + deploy + commit:
```bash
npm run typecheck && npm run mcp:deploy && git add workers/mcp/ && git commit -m "KB: document upload + inline ingestion + search routes"
```

---

### Task 5: MCP tool — `search_knowledge_base`

**Files:**
- Create: `workers/mcp/src/tools/knowledge.ts`
- Modify: `workers/mcp/src/context.ts` (add `ai` to `ToolCtx`)
- Modify: `workers/mcp/src/mcp.ts` (register tool; pass `ai` into ctx; widen `Env`)
- Modify: `workers/mcp/src/index.ts` (SSE `getCtx` passes `ai`)

**Interfaces:**
- Consumes: `searchKnowledgeBase` (Task 3).
- Produces: MCP tool `search_knowledge_base({ query, top_k? })`, scope `knowledge:read`. `ToolCtx` gains `ai: Ai`.

- [ ] **Step 1:** In `workers/mcp/src/context.ts`, add `ai` to `ToolCtx`:
```ts
export type ToolCtx = {
  db: Db
  ai: Ai
  businessId: string
  scopes: ApiScope[]
}
```

- [ ] **Step 2:** Create `workers/mcp/src/tools/knowledge.ts`:
```ts
import { z } from 'zod'

import type { Registrar } from '../context'
import { searchKnowledgeBase } from '../lib/knowledge'
import { ok } from '../lib/respond'

export function registerKnowledgeTools(def: Registrar): void {
  def(
    'search_knowledge_base',
    "Search this business's uploaded documents (price lists, policies, guides) for content relevant to the caller's question. Use this for any question not answered by get_business_info. Returns the most relevant passages with their source document.",
    { query: z.string().min(1), top_k: z.number().int().min(1).max(10).optional() },
    'knowledge:read',
    async ({ query, top_k }, ctx) => {
      const hits = await searchKnowledgeBase(ctx.db, ctx.ai, ctx.businessId, query, top_k ?? 5)
      if (hits.length === 0) {
        return ok({ results: [], note: 'This business has no matching knowledge base content yet.' })
      }
      return ok({
        results: hits.map((h) => ({ source: h.filename, text: h.text, score: Number(h.score.toFixed(3)) })),
      })
    },
  )
}
```

- [ ] **Step 3:** In `workers/mcp/src/mcp.ts`: import + register the tool, widen `Env`, and pass `ai` into `ctx`:
```ts
import { registerKnowledgeTools } from './tools/knowledge'
// inside buildRegistry(), after registerCallTools(def):
registerKnowledgeTools(def)
// widen Env:
type Env = { DB: D1Database; AI: Ai }
// in handleMcp's ctx construction, add:
ai: env.AI,
```

- [ ] **Step 4:** In `workers/mcp/src/index.ts`, the SSE `getCtx` adds `ai`:
```ts
const getCtx = (): ToolCtx => ({
  db: createDb(this.env.DB),
  ai: this.env.AI,
  businessId: this.props?.businessId ?? DEMO_BUSINESS_ID,
  scopes: this.props?.scopes ?? [...API_SCOPES],
})
```

- [ ] **Step 5:** Typecheck + deploy + commit:
```bash
npm run typecheck && npm run mcp:deploy && git add workers/mcp/ && git commit -m "KB: search_knowledge_base MCP tool (both transports)"
```

---

### Task 6: Dashboard — `/knowledge` page + components

**Files:**
- Create: `app/knowledge/page.tsx`, `components/KnowledgeManager.tsx`
- Create: `app/api/me/documents/route.ts` (multipart upload route handler)
- Modify: `lib/format.ts` (doc status colors/labels), `lib/api.ts` (types + `getMyDocuments`), `components/AppShell.tsx` (nav link), `middleware.ts` (gate `/knowledge`)

**Interfaces:**
- Consumes: worker routes from Tasks 4. Proxy (`/api/proxy/...`) for list/get/delete/search; dedicated `/api/me/documents` route for upload.
- Produces: owner-facing KB UI.

- [ ] **Step 1:** In `lib/format.ts`, add:
```ts
export const DOC_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', processing: 'Processing', ready: 'Ready', failed: 'Failed',
}
export const DOC_STATUS_COLOR: Record<string, string> = {
  pending: 'var(--faint)', processing: 'var(--amber)', ready: 'var(--teal)', failed: 'var(--rose)',
}
```

- [ ] **Step 2:** In `lib/api.ts`, add the type + server fetch:
```ts
export type DocumentRow = {
  id: string; filename: string; title: string | null; content_type: string
  size_bytes: number; status: string; error: string | null; chunk_count: number
  created_at: string; updated_at: string
}
export async function getMyDocuments(): Promise<DocumentRow[]> {
  const { workerFetch } = await import('./auth-server')
  const res = await workerFetch('/api/me/documents')
  if (!res.ok) return []
  return (await res.json()).documents ?? []
}
```

- [ ] **Step 3:** Create `app/api/me/documents/route.ts` (streams multipart to the worker with the session bearer; the generic JSON proxy can't carry binary):
```ts
import { NextRequest, NextResponse } from 'next/server'
import { workerFetch } from '@/lib/auth-server'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const form = await req.formData()
  const res = await workerFetch('/api/me/documents', { method: 'POST', body: form })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  })
}
```

- [ ] **Step 4:** Create `components/KnowledgeManager.tsx` — a client component: drag-drop upload (POST `/api/me/documents`), document list with status badges, polling every 3s while any doc is `processing`, delete (DELETE `/api/proxy/api/me/documents/:id`), and an "Ask your knowledge base" box (POST `/api/proxy/api/me/knowledge/search`). Use `DOC_STATUS_COLOR`/`DOC_STATUS_LABEL`. (Full code authored during implementation; mirrors `SettingsForm` client patterns, `card`/`navi`/`pill` Tailwind tokens.)

- [ ] **Step 5:** Create `app/knowledge/page.tsx` (server component, session-gated, mirrors `settings/page.tsx`):
```tsx
import { redirect } from 'next/navigation'
import { getMyDocuments, getMyDashboard, WORKER_BASE } from '@/lib/api'
import { getSession } from '@/lib/auth-server'
import { AppShell } from '@/components/AppShell'
import { KnowledgeManager } from '@/components/KnowledgeManager'

export const dynamic = 'force-dynamic'

export default async function KnowledgePage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const data = await getMyDashboard()
  if (!data) redirect('/onboarding')
  const docs = await getMyDocuments()
  return (
    <AppShell business={data.business} user={session.user} mcpUrl={`${WORKER_BASE}/mcp`}>
      <KnowledgeManager initialDocs={docs} />
    </AppShell>
  )
}
```

- [ ] **Step 6:** In `components/AppShell.tsx`, add a `/knowledge` link beside the Settings `<Link>`:
```tsx
<Link href="/knowledge" className="navi">
  <span className="text-faint"><IconDoc /></span>
  Knowledge
</Link>
```
Add an `IconDoc` SVG component alongside the other icons.

- [ ] **Step 7:** In `middleware.ts`, add `/knowledge` to `PROTECTED` and to `config.matcher` (`'/knowledge/:path*'`).

- [ ] **Step 8:** Build + commit:
```bash
npm run build && git add app/ components/ lib/ middleware.ts && git commit -m "KB: /knowledge dashboard page — upload, status, delete, test search"
```

---

### Task 7: End-to-end test + docs

**Files:**
- Create: `tests/e2e-knowledge.mjs`
- Modify: `package.json` (`test:e2e:knowledge` script), `tests/fixtures-teardown.sql` (clean test docs/chunks), `CLAUDE.md`

**Interfaces:**
- Consumes: deployed worker routes + MCP tool.

- [ ] **Step 1:** Write `tests/e2e-knowledge.mjs` against the deployed worker: signup+onboard a test owner → upload a small text doc (known content) via `POST /api/me/documents` (session cookie/bearer) → poll `GET /api/me/documents/:id` until `status==='ready'` (assert `chunk_count>0`) → call `search_knowledge_base` over `/mcp` with the business key → assert top hit text contains the known content + source filename → second business's key returns no hits for the same query (isolation) → a key without `knowledge:read` is rejected → DELETE the doc → assert gone + search empty. Mirror `tests/e2e-auth.mjs` harness style. Use `authtest+<ts>@example.test` accounts.

- [ ] **Step 2:** Add to `package.json` scripts: `"test:e2e:knowledge": "node tests/e2e-knowledge.mjs"`.

- [ ] **Step 3:** Extend `tests/fixtures-teardown.sql` to delete `kb_chunks`/`documents` for test businesses.

- [ ] **Step 4:** Run it:
```bash
npm run test:e2e:knowledge
```
Expected: all assertions pass.

- [ ] **Step 5:** Update `CLAUDE.md` (new `/knowledge` surface, two tables, `knowledge:*` scopes, R2/AI bindings, `test:e2e:knowledge` command). Commit:
```bash
git add tests/ package.json CLAUDE.md && git commit -m "KB: e2e tests + teardown + docs"
```

---

## Self-Review

**Spec coverage:** §4 tables → Task 1; §5 infra → Task 2; §6.1 RAG core → Task 3; §6.2 routes + ingestion → Task 4; §7 MCP tool → Task 5; §8 UI → Task 6; §9 error handling → Tasks 4/6 (validation, failed-status, isolation); §11 testing → Task 7; §12 build order matches Tasks 1–7. Covered.

**Placeholder scan:** Only Task 6 Step 4 (`KnowledgeManager.tsx`) defers full component code to implementation — acceptable as it's a sizable presentational client component following an existing pattern (`SettingsForm`); all interface/contract details (endpoints, status maps, polling rule) are specified. No other placeholders.

**Type consistency:** `searchKnowledgeBase(db, ai, businessId, query, topK?, minScore?)` consistent across Tasks 3/4/5. `ToolCtx.ai` added in Task 5 Step 1 and consumed in Step 2; `Env.AI`/`Env.DOCS` added in Task 2 and used in Tasks 4/5. `documents`/`kbChunks` table+column names consistent. Embedding model constant single-sourced.
