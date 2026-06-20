'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { DocumentRow } from '@/lib/api'
import { DOC_STATUS_COLOR, DOC_STATUS_LABEL, fmtBytes, relTime } from '@/lib/format'

type Hit = { source: string; text: string; score: number }

export function KnowledgeManager({ initialDocs }: { initialDocs: DocumentRow[] }) {
  const [docs, setDocs] = useState<DocumentRow[]>(initialDocs)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const anyProcessing = docs.some((d) => d.status === 'processing' || d.status === 'pending')

  const refresh = useCallback(async () => {
    const res = await fetch('/api/proxy/api/me/documents', { cache: 'no-store' })
    if (res.ok) setDocs((await res.json()).documents ?? [])
  }, [])

  // Poll while anything is still ingesting, then stop.
  useEffect(() => {
    if (!anyProcessing) return
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [anyProcessing, refresh])

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/me/documents', { method: 'POST', body: form })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          setError(body.error ?? `Upload failed (${res.status})`)
          continue
        }
        const { document } = (await res.json()) as { document: DocumentRow }
        setDocs((prev) => [document, ...prev.filter((d) => d.id !== document.id)])
      }
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function remove(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id))
    await fetch(`/api/proxy/api/me/documents/${id}`, { method: 'DELETE' })
  }

  return (
    <div className="animate-rise">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Knowledge base</h1>
          <p className="mt-1 text-sm text-muted">
            Upload documents your AI agent can read from — price lists, policies, menus, guides. We parse, chunk, and
            embed each file so the agent can answer callers from its content.
          </p>
        </div>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void upload(e.dataTransfer.files)
        }}
        className={`mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition ${
          dragOver ? 'border-amber bg-[color-mix(in_srgb,var(--amber)_8%,transparent)]' : 'border-line bg-panel2'
        }`}
      >
        <div className="text-sm font-medium text-ink">Drag & drop documents here</div>
        <div className="mt-1 text-xs text-faint">PDF, DOCX, TXT, or Markdown · up to 10 MB each</div>
        <button className="btn btn-primary mt-4" onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Choose files'}
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
          className="hidden"
          onChange={(e) => void upload(e.target.files)}
        />
      </div>
      {error && <p className="mt-2 text-sm text-rose">{error}</p>}

      {/* Document list */}
      <div className="card mt-6 p-0">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">Documents</h2>
          <span className="text-xs text-faint">{docs.length} total</span>
        </div>
        {docs.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-faint">No documents yet — upload your first above.</div>
        ) : (
          <ul className="divide-y divide-line">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-4 px-5 py-3">
                <span className="text-faint"><IconDoc /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{d.title || d.filename}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-faint">
                    <span>{fmtBytes(d.size_bytes)}</span>
                    <span>·</span>
                    <span>{d.status === 'ready' ? `${d.chunk_count} chunks` : relTime(d.created_at)}</span>
                    {d.status === 'failed' && d.error && (
                      <>
                        <span>·</span>
                        <span className="text-rose" title={d.error}>{d.error}</span>
                      </>
                    )}
                  </div>
                </div>
                <StatusBadge status={d.status} />
                <button className="btn text-rose" onClick={() => void remove(d.id)} title="Delete">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <KnowledgeSearch hasReady={docs.some((d) => d.status === 'ready')} />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color = DOC_STATUS_COLOR[status] ?? 'var(--faint)'
  return (
    <span className="pill" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
      {(status === 'processing' || status === 'pending') && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: color }} />
      )}
      {DOC_STATUS_LABEL[status] ?? status}
    </span>
  )
}

function KnowledgeSearch({ hasReady }: { hasReady: boolean }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/proxy/api/me/knowledge/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const body = (await res.json().catch(() => ({ hits: [] }))) as { hits?: Hit[] }
      setHits(body.hits ?? [])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card mt-6 p-5">
      <h2 className="text-sm font-semibold text-ink">Ask your knowledge base</h2>
      <p className="mt-0.5 text-sm text-muted">
        See exactly what your agent retrieves — the same search the voice agent runs mid-call.
      </p>
      <form onSubmit={search} className="mt-3 flex gap-2">
        <input
          className="field"
          placeholder="e.g. What are your prices for a cleaning?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn btn-primary shrink-0" disabled={loading || !query.trim()}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>
      {!hasReady && <p className="mt-2 text-xs text-faint">Upload and process a document first to get results.</p>}
      {hits && (
        <div className="mt-4 space-y-2">
          {hits.length === 0 ? (
            <p className="text-sm text-faint">No relevant passages found.</p>
          ) : (
            hits.map((h, i) => (
              <div key={i} className="rounded-lg border border-line bg-panel2 p-3">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-teal">{h.source}</span>
                  <span className="font-mono text-faint">score {h.score.toFixed(3)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted">{h.text}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function IconDoc() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M4 1.5h5L13 5v9a.5.5 0 01-.5.5h-9A.5.5 0 013 14V2a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 1.5V5h4M5.5 8.5h5M5.5 11h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
