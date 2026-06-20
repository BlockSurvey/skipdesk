/**
 * Knowledge-base RAG core: chunk → embed → cosine search, all tenant-scoped.
 *
 * Vectors live in D1 (kb_chunks.embedding as JSON); search is brute-force cosine
 * over the tenant's chunks. ONE embedding-model constant is shared by ingest and
 * search so the query and the corpus can never be embedded differently. Vectors
 * are L2-normalized at write+query time, so a cosine score collapses to a plain
 * dot product.
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
    // A single oversized paragraph: hard-split it so no chunk blows the limit.
    while (buf.length > CHUNK_CHARS) {
      chunks.push(buf.slice(0, CHUNK_CHARS))
      buf = buf.slice(CHUNK_CHARS - CHUNK_OVERLAP)
    }
  }
  if (buf.trim()) chunks.push(buf)
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
  // Workers AI accepts an array of texts; batch to stay within request limits.
  const BATCH = 50
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH)
    const res = (await ai.run(EMBEDDING_MODEL, { text: slice })) as { data: number[][] }
    for (const v of res.data) out.push(normalize(v))
  }
  return out
}

/** Cosine similarity of two L2-normalized vectors == their dot product. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) dot += a[i]! * b[i]!
  return dot
}

export type KbHit = { text: string; score: number; documentId: string; filename: string }

/** Embed the query, score it against the tenant's chunks, return top-K hits. */
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
