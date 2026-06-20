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

      <div className="max-h-[560px] overflow-auto rounded-xl border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-panel2">
            <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-faint">
              <Th>Caller</Th>
              <Th>Outcome</Th>
              <Th>Summary</Th>
              <Th>Intent</Th>
              <Th>Duration</Th>
              <Th className="text-right">When</Th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-faint">No calls match.</td>
              </tr>
            )}
            {shown.map((c) => {
              const open = openId === c.id
              return (
                <FragmentRow key={c.id}>
                  <tr onClick={() => setOpenId(open ? null : c.id)} className="cursor-pointer border-t border-line transition hover:bg-panel2">
                    <td className="whitespace-nowrap px-3 py-3 align-top">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] text-faint transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
                        {c.sentiment && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SENTIMENT_COLOR[c.sentiment] }} title={c.sentiment} />}
                        <span className="font-mono text-[13px] text-ink">{c.caller_number ?? 'unknown'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      {c.outcome ? <Badge label={OUTCOME_LABEL[c.outcome] ?? c.outcome} color={OUTCOME_COLOR[c.outcome] ?? 'var(--faint)'} /> : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-3 py-3 align-top text-muted">
                      <p className="line-clamp-2 max-w-[320px]" title={c.summary ?? ''}>{c.summary ?? 'No summary captured.'}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-muted">{c.intent ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 align-top font-mono text-[12px] text-faint">{fmtDuration(c.duration_seconds)}</td>
                    <td suppressHydrationWarning className="whitespace-nowrap px-3 py-3 text-right align-top font-mono text-[11px] text-faint">{relTime(c.started_at)}</td>
                  </tr>
                  {open && (
                    <tr className="border-t border-line bg-panel2/60">
                      <td colSpan={6} className="px-3 pb-4 pt-1 text-xs text-muted">
                        <Label>Started</Label>
                        <div className="mt-0.5">{fmtDateTime(c.started_at, tz)}</div>
                        <Label className="mt-3">Summary</Label>
                        <p className="mt-0.5 leading-relaxed">{c.summary ?? 'No summary captured.'}</p>
                        {c.transcript && (
                          <>
                            <Label className="mt-3">Transcript</Label>
                            <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{c.transcript}</p>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Group a main row + its (optional) detail row without an extra DOM node. */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-medium ${className}`}>{children}</th>
}

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`font-mono text-[10px] uppercase tracking-wider text-faint ${className}`}>{children}</div>
}
