'use client'

import { useMemo, useState } from 'react'
import type { Call } from '@/lib/api'
import { fmtDuration, fmtDateTime, OUTCOME_COLOR, OUTCOME_LABEL, relTime, SENTIMENT_COLOR } from '@/lib/format'
import { Badge } from './Badge'

const FILTERS = ['all', 'appointment_booked', 'lead_captured', 'escalated', 'info_provided'] as const

export function CallsFeed({ calls, tz }: { calls: Call[]; tz: string }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  const shown = useMemo(() => (filter === 'all' ? calls : calls.filter((c) => c.outcome === filter)), [calls, filter])

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === f ? 'bg-primary text-white' : 'border border-line text-muted hover:bg-panel2'
            }`}
          >
            {f === 'all' ? 'all' : OUTCOME_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
        {shown.length === 0 && <p className="py-8 text-center text-sm text-faint">No calls match.</p>}
        {shown.map((c) => {
          const open = openId === c.id
          return (
            <button
              key={c.id}
              onClick={() => setOpenId(open ? null : c.id)}
              className="block w-full rounded-xl border border-line bg-panel p-4 text-left transition hover:border-[#d9d9d4] hover:bg-panel2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {c.sentiment && <span className="h-2 w-2 rounded-full" style={{ background: SENTIMENT_COLOR[c.sentiment] }} title={c.sentiment} />}
                  <span className="font-mono text-sm text-ink">{c.caller_number ?? 'unknown'}</span>
                </div>
                {c.outcome && <Badge label={OUTCOME_LABEL[c.outcome] ?? c.outcome} color={OUTCOME_COLOR[c.outcome] ?? 'var(--faint)'} />}
              </div>
              <p className={`mt-2 text-sm text-muted ${open ? '' : 'line-clamp-2'}`}>{c.summary ?? 'No summary captured.'}</p>
              <div className="mt-2.5 flex items-center gap-3 font-mono text-[11px] text-faint">
                <span>{relTime(c.started_at)}</span>
                <span className="h-1 w-1 rounded-full bg-faint" />
                <span>{fmtDuration(c.duration_seconds)}</span>
                {c.intent && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-faint" />
                    <span className="text-muted">{c.intent}</span>
                  </>
                )}
              </div>
              {open && (
                <div className="mt-3 border-t border-line pt-3 text-xs text-muted">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-faint">Started</div>
                  <div className="mt-0.5">{fmtDateTime(c.started_at, tz)}</div>
                  {c.transcript && (
                    <>
                      <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-faint">Transcript</div>
                      <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{c.transcript}</p>
                    </>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
