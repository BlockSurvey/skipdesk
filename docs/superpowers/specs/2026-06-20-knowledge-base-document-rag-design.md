# Knowledge Base — Document Upload + RAG (design)

**Status:** approved, ready for implementation plan
**Date:** 2026-06-20
**Owner:** Skip Desk
**Related:** `2026-06-19-skip-desk-design.md` (system design), `2026-06-20-accounts-onboarding-auth-design.md` (auth/sessions), `db/schema.ts`, `workers/mcp/`

## 1. Summary

Give each business a **knowledge base**: the owner uploads documents (PDF, DOCX, TXT, Markdown) in the dashboard; each file is stored in **Cloudflare R2** under the business's namespace, converted to text, chunked, embedded, and the embeddings are stored in **D1** tagged with `business_id`. A new **MCP tool** (`search_knowledge_base`) lets the voice agent semantically search a business's documents and answer caller questions that aren't covered by the structured FAQ.

This is the first feature that adds object storage (R2) and compute (Workers AI) to the stack. **Vectors still live in D1** — the "D1 is the database" rule holds; R2 only holds raw blobs and Workers AI only does conversion + embedding. This is the single, deliberate, documented deviation from the "D1-only" constraint, and it is additive (no existing table or flow changes).

### Goals

- Owner can upload, list, see processing status of, and delete documents in the dashboard.
- Every document and every embedding is **tenant-isolated** by `business_id`, enforced in the data layer on every query — identical to all existing tables.
- A clean, auditable trace: one `documents` row per file with lifecycle status; one `kb_chunks` row per chunk linked back to its document.
- The voice agent can call `search_knowledge_base(query)` over MCP and get back relevant snippets + their source filenames.
- End-to-end tested against the deployed worker, including cross-tenant isolation.

### Non-goals (v1)

- No dedicated vector database (Vectorize) — brute-force cosine over the tenant's chunks in D1 (documented upgrade path in §10).
- No async queue — ingestion runs inline via `waitUntil` (documented upgrade path in §10).
- No OCR of scanned-image PDFs beyond what Workers AI `toMarkdown` natively provides.
- No re-embedding/versioning of an edited document — delete + re-upload.
- No per-document access control beyond the single business owner (matches the single-owner model).
- No incremental/streaming upload of very large files; a per-file size cap applies (§6).

## 2. User stories

- As an **owner**, I upload my clinic's "Services & Pricing.pdf" and within seconds see it move from *Processing* to *Ready* with a chunk count, so I know the agent can use it.
- As an **owner**, I type a question into "Ask your knowledge base" and see the snippets the agent would retrieve, so I trust what it will say.
- As an **owner**, I delete an outdated document and its content immediately stops surfacing in agent answers.
- As the **voice agent** (machine, via MCP), when a caller asks something not in the FAQ, I call `search_knowledge_base` and answer from the business's own documents, citing nothing to the caller but grounded in real content.

## 3. Architecture

One feature spanning the three existing surfaces over the **shared `db/` data layer**:

```
┌────────────────────┐     multipart      ┌─────────────────────────────────────┐
│ Dashboard /knowledge│ ───────────────────▶│ Worker: POST /api/me/documents       │
│ (Next.js, session)  │                     │  1. validate type/size               │
│  - upload (drag)    │                     │  2. R2.put(docs/{biz}/{doc}/file)    │
│  - doc list + poll  │◀──── status ────────│  3. insert documents(status=processing)
│  - delete           │                     │  4. ctx.waitUntil(ingest(doc))       │
│  - test search box  │                     └───────────────┬─────────────────────┘
└────────────────────┘                                     │ ingest (inline, async)
                                                            ▼
                              AI.toMarkdown(blob) → markdown → chunk → AI embed (bge)
                                                            │
                                                            ▼
                                          insert kb_chunks(business_id, embedding…)
                                          update documents(status=ready, chunk_count)

┌────────────────────┐   MCP (Streamable HTTP / SSE)   ┌──────────────────────────┐
│ Voice agent / Claude│ ───────────────────────────────▶│ search_knowledge_base     │
│ (Bearer API key)    │                                 │  embed(query) → cosine    │
│                     │◀──── top-K snippets + sources ──│  over tenant kb_chunks     │
└────────────────────┘                                 └──────────────────────────┘
```

Request → auth (session for the dashboard, API key for the agent) → resolve `business_id` from the **authenticated principal** → tenant-scoped query → D1 (+ R2 / Workers AI). `business_id` is **never** read from request input.

## 4. Data model (D1, `db/schema.ts`)

Two new tables. Conventions unchanged: TEXT UUIDv4 PKs (`crypto.randomUUID()`), ISO-8601 UTC TEXT timestamps, enums as TEXT + CHECK built from `db/enums.ts`, JSON as TEXT via `mode:'json'`. Composite indexes lead with `business_id`.

### 4.1 `documents` — one row per uploaded file (the audit trace)

| column | type | notes |
|---|---|---|
| `id` | TEXT pk | UUIDv4 |
| `business_id` | TEXT notNull → businesses(id) cascade | tenant |
| `filename` | TEXT notNull | original upload name |
| `title` | TEXT | optional display title (defaults to filename in UI) |
| `content_type` | TEXT notNull | MIME of the upload |
| `size_bytes` | INTEGER notNull | upload size |
| `r2_key` | TEXT notNull | `documents/{business_id}/{id}/{filename}` |
| `status` | TEXT notNull default `'processing'` | `DOCUMENT_STATUSES` |
| `error` | TEXT | failure reason when `status='failed'` |
| `chunk_count` | INTEGER notNull default 0 | filled when ready |
| `uploaded_by` | TEXT → users(id) set null | who uploaded |
| `created_at` | TEXT notNull | |
| `updated_at` | TEXT notNull | bumped on status change |

Indexes: `idx_documents_business_created (business_id, created_at)` (list, reverse-chron), `idx_documents_business_status (business_id, status)` (poll/filter). Check: `status IN DOCUMENT_STATUSES`.

### 4.2 `kb_chunks` — one row per chunk + its embedding

| column | type | notes |
|---|---|---|
| `id` | TEXT pk | UUIDv4 |
| `business_id` | TEXT notNull → businesses(id) cascade | tenant (scan filter) |
| `document_id` | TEXT notNull → documents(id) cascade | parent doc; cascade delete |
| `chunk_index` | INTEGER notNull | order within document |
| `text` | TEXT notNull | chunk content (returned to the agent) |
| `embedding` | TEXT (`mode:'json'`) notNull | `number[]` length 768 (bge-base) |
| `char_count` | INTEGER | chunk length, for debugging/UI |
| `created_at` | TEXT notNull | |

Indexes: `idx_kb_chunks_business (business_id)` (the search scan — satisfies the tenant filter for the cosine pass), `idx_kb_chunks_document (document_id)` (per-doc delete/count). No cross-tenant query path exists: `searchKnowledgeBase` always filters `business_id` first.

### 4.3 enums (`db/enums.ts`)

```ts
export const DOCUMENT_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]
```

Add to `API_SCOPES`: `'knowledge:read'`, `'knowledge:write'`. `knowledge:read` gates the search tool; `knowledge:write` reserved for a future machine upload path (UI upload is session-gated, not key-gated). The `/register` default key (`src/register.ts`) gains `knowledge:read` so a newly onboarded business's agent can search immediately.

### 4.4 relations

`documents` belongs to one `business` and one `uploadedBy` user, and has many `kbChunks`; `kbChunks` belongs to one `business` and one `document`. Add `documents: many(...)` to `businessesRelations`. Export `$inferSelect`/`$inferInsert` types (`Document`, `NewDocument`, `KbChunk`, `NewKbChunk`).

### 4.5 migration

Edit `schema.ts` → `npm run db:generate` (never hand-edit SQL) → `npm run d1:migrate`. Additive; no backfill.

## 5. Infrastructure (`workers/mcp/wrangler.toml`)

Add two bindings:

```toml
# R2 — raw uploaded document blobs (one bucket, namespaced by business_id in the key).
[[r2_buckets]]
binding = "DOCS"
bucket_name = "skip-desk-docs"

# Workers AI — document→markdown conversion (toMarkdown) + text embeddings (bge).
[ai]
binding = "AI"
```

Create the bucket once: `wrangler r2 bucket create skip-desk-docs`. The `Env` type in the worker gains `DOCS: R2Bucket` and `AI: Ai`. No new secrets. Workers AI usage (toMarkdown + embeddings) is billed per Cloudflare AI pricing; acceptable at hackathon scale.

**Embedding model:** `@cf/baai/bge-base-en-v1.5` (768-dim). Query and chunks must use the **same** model — encode this as a single exported constant `EMBEDDING_MODEL` so it can never drift between ingest and search.

## 6. Worker services

### 6.1 `src/lib/knowledge.ts` — the RAG core (pure, testable)

- `EMBEDDING_MODEL` / `EMBEDDING_DIMS` constants.
- `chunkMarkdown(md: string): string[]` — split into ~1,000-char chunks with ~150-char overlap, preferring paragraph/heading boundaries; drops empty/whitespace-only chunks. Deterministic.
- `embedTexts(ai, texts: string[]): Promise<number[][]>` — batched `ai.run(EMBEDDING_MODEL, { text })`; normalizes vectors for cosine.
- `cosineSimilarity(a, b): number`.
- `searchKnowledgeBase(db, ai, businessId, query, topK = 5, minScore = 0.2)` — embed query → load `{id, documentId, text, embedding}` for the tenant's chunks (joined to `documents.filename`/`title`) → score → sort desc → return top-K above `minScore` as `{ text, score, documentId, filename }[]`. Always filters `business_id` first.

### 6.2 `src/documents.ts` — session-gated routes (mirrors `src/account.ts`)

All resolve `business_id` from the session user (`resolveAuth`), never from URL/body:

- `POST /api/me/documents` (multipart `file`, optional `title`): validate MIME ∈ {pdf, docx, txt, md} and `size ≤ MAX_DOC_BYTES` (10 MB) → `DOCS.put(r2Key, body)` → insert `documents(status='processing')` → `ctx.waitUntil(ingest(env, doc))` → 201 with the document row.
- `GET /api/me/documents` → tenant's documents, reverse-chron (for the list + polling).
- `GET /api/me/documents/:id` → single document (status poll).
- `DELETE /api/me/documents/:id` → delete `kb_chunks` (cascade) + `DOCS.delete(r2Key)` + the `documents` row. Idempotent.
- `POST /api/me/knowledge/search` (`{ query, topK? }`) → `searchKnowledgeBase` for the dashboard "Ask your knowledge base" box (reuses the exact MCP path).

`ingest(env, doc)`: read blob from R2 → `env.AI.toMarkdown([{ name: filename, blob }])` → `chunkMarkdown` → `embedTexts` (batched) → insert `kb_chunks` → update `documents(status='ready', chunk_count=n)`. Any throw → `documents(status='failed', error=message)`; the partial chunks for that doc are deleted so a failed doc never serves stale partial content. (For `txt`/`md`, `toMarkdown` still yields clean text; no special-casing needed.)

### 6.3 routing (`src/index.ts`)

Mount the `/api/me/documents*` and `/api/me/knowledge/search` routes next to the existing `/api/me/*` handlers. `Env` extended with `DOCS` + `AI`.

## 7. MCP tool (`workers/mcp/src/tools/knowledge.ts`)

`search_knowledge_base` — defined as a plain `ToolDef` via `createRegistrar`, so it appears on **both** `/mcp` (stateless Streamable HTTP) and `/sse` automatically.

- **scope:** `knowledge:read`
- **input:** `{ query: string (required), top_k?: number (default 5, max 10) }`
- **behavior:** resolve `business_id` from the API key (demo-tenant fallback for no-auth testing) → `searchKnowledgeBase(db, ai, businessId, query, top_k)`.
- **output:** a compact, agent-friendly result: each hit as `source` (filename) + `text` (snippet) + `score`, plus a top-level note when the KB is empty ("This business has no knowledge base documents yet") so the agent degrades gracefully instead of hallucinating.

This is **additive** to `get_business_info` (structured FAQ). The agent prompt (build guide, Phase 6) should prefer the FAQ for crisp facts and fall back to `search_knowledge_base` for everything else — but that prompt wiring is external and out of scope here.

## 8. Dashboard UI (`app/knowledge`)

New route `app/knowledge/page.tsx`, gated by `middleware.ts` (add `/knowledge` to the matcher) and linked in `AppShell` nav ("Knowledge", with an appropriate icon).

- **Upload zone** — drag-drop + file picker (`components/DocumentUpload.tsx`). On select: client validates type/size, POSTs multipart, optimistically inserts a *Processing* row.
- **Document list** — `components/DocumentsList.tsx`: table of filename/title, type, size, **status badge**, chunk count, uploaded date, delete. Polls `GET /api/me/documents` every ~3 s **while any row is `processing`** (a `ClientOnly` interval, matching existing client-data patterns), then stops.
- **Ask your knowledge base** — `components/KnowledgeSearch.tsx`: a query box that hits `POST /api/me/knowledge/search` and renders the returned snippets + source filenames + scores. This is the owner-facing "see what the agent sees" demo affordance.
- **Status colors** — add a `documentStatus` map to `lib/format.ts`: `processing`→amber, `ready`→teal, `failed`→rose, `pending`→neutral (consistent with the existing signal/booked/escalation palette).

**Next.js wiring:** uploads get a **dedicated** route handler at `app/api/me/documents/route.ts` that reads the incoming `FormData` and streams the multipart body to the worker with the session cookie's Bearer (the generic JSON proxy can't carry binary multipart). List/get/delete/search go through the existing authed proxy (`app/api/proxy/[...path]`). Base URL from `NEXT_PUBLIC_MCP_BASE`.

## 9. Error handling & edge cases

| case | handling |
|---|---|
| Unsupported MIME / oversize | 400 before R2 put; UI shows inline error, no row created |
| Empty / unparseable file (0 chunks) | `status='failed'`, `error='no extractable text'`; UI shows *Failed* + reason |
| `toMarkdown` or embedding throws | `status='failed'` + message; partial chunks for the doc deleted |
| Worker CPU/subrequest limit on a huge doc | bounded by `MAX_DOC_BYTES`; documented Queue upgrade path (§10) |
| Search with no ready docs | tool returns empty hits + the "no knowledge base yet" note |
| Delete of a still-processing doc | allowed; cascade removes whatever chunks exist + R2 blob |
| Cross-tenant access | impossible — every query filters `business_id` from the principal first |
| Duplicate filename | allowed; rows are distinct by `id`, R2 keys distinct by `doc_id` |

## 10. Known limits & upgrade paths (no migration required to adopt)

- **Brute-force cosine is O(n) per tenant.** Fine for hundreds–low-thousands of chunks per business. At large scale, move vectors to **Cloudflare Vectorize** (namespace = `business_id`); `documents`/`kb_chunks.text` stay in D1, and the `searchKnowledgeBase` signature + MCP/UI contracts are unchanged.
- **Inline `waitUntil` ingestion** is bounded by Worker CPU/subrequest limits. For big/bulk uploads, move `ingest` behind a **Cloudflare Queue** consumer; the `documents.status` lifecycle already models async, so the UI/polling needs no change.

## 11. Testing (`tests/e2e-knowledge.mjs`, `npm run test:e2e:knowledge`)

End-to-end against the **deployed** worker (Cloudflare creds exported), reusing the auth/e2e harness style:

1. Sign up + onboard a test business (or reuse the auth-test pattern); capture session + API key.
2. Upload a small known text document via `POST /api/me/documents`.
3. Poll `GET /api/me/documents/:id` until `status='ready'`; assert `chunk_count > 0`.
4. `search_knowledge_base` (MCP) with a query whose answer is in the doc → assert the top hit's `text` contains the expected content and `source` is the filename.
5. **Tenant isolation:** a second business's key searching the same query returns no hits from the first business's document.
6. **Scope:** a key lacking `knowledge:read` is rejected by the tool.
7. Delete the document → assert it's gone from the list, chunks removed, and search no longer returns it.

Test rows use the existing test conventions (test emails / `+1999000xxxx` phones / dedicated test business); `tests/fixtures-teardown.sql` extended to delete `documents`/`kb_chunks` for test businesses, and the R2 objects cleaned by the test's own delete step.

## 12. Build order (for the implementation plan)

1. **Schema + enums + migration** — `documents`, `kb_chunks`, `DOCUMENT_STATUSES`, new scopes; `db:generate` + `d1:migrate`; register default-key scope.
2. **Infra** — create R2 bucket; add `DOCS` + `AI` bindings; extend `Env`.
3. **RAG core** — `src/lib/knowledge.ts` (chunk/embed/cosine/search) with the `EMBEDDING_MODEL` constant.
4. **Routes + ingestion** — `src/documents.ts` (`/api/me/documents*`, `/api/me/knowledge/search`), `ingest` via `waitUntil`; mount in `src/index.ts`.
5. **MCP tool** — `src/tools/knowledge.ts` (`search_knowledge_base`); verify it lists on `/mcp` + `/sse`.
6. **Dashboard** — `/knowledge` page + `DocumentUpload`/`DocumentsList`/`KnowledgeSearch` components, nav + middleware, `format.ts` status colors, Next upload route handler.
7. **Tests + docs** — `tests/e2e-knowledge.mjs`, teardown rows, `package.json` script; update `CLAUDE.md` (new surface, tables, scopes, commands).

Each step compiles + is verified by test (never by running a dev server, per the repo's `.next` constraint).
