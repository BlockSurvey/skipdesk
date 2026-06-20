import type { Lead } from '@/lib/api'
import { relTime, STATUS_COLOR, URGENCY_COLOR } from '@/lib/format'
import { Badge } from './Badge'

export function LeadsList({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) return <p className="py-8 text-center text-sm text-faint">No leads captured yet.</p>
  return (
    <div className="max-h-[460px] overflow-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-panel2">
          <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-faint">
            <Th>Lead</Th>
            <Th>Phone</Th>
            <Th>Reason</Th>
            <Th>Urgency</Th>
            <Th>Status</Th>
            <Th className="text-right">Captured</Th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-t border-line transition hover:bg-panel2">
              <td className="px-3 py-3 align-top">
                <div className="flex items-center gap-1.5">
                  {l.escalated && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose" title="Escalated" />}
                  <span className="font-medium text-ink">{l.full_name}</span>
                </div>
                {l.email && <div className="mt-0.5 max-w-[180px] truncate text-[11px] text-faint">{l.email}</div>}
              </td>
              <td className="whitespace-nowrap px-3 py-3 align-top font-mono text-[13px] text-muted">{l.phone}</td>
              <td className="px-3 py-3 align-top text-muted">
                <p className="line-clamp-2 max-w-[300px]" title={l.reason ?? ''}>{l.reason ?? '—'}</p>
              </td>
              <td className="px-3 py-3 align-top">
                <Badge label={l.urgency} color={URGENCY_COLOR[l.urgency] ?? 'var(--faint)'} />
              </td>
              <td className="px-3 py-3 align-top">
                <span className="inline-flex items-center gap-1.5 capitalize" style={{ color: STATUS_COLOR[l.status] ?? 'var(--muted)' }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[l.status] ?? 'var(--faint)' }} />
                  {l.status}
                </span>
              </td>
              <td suppressHydrationWarning className="whitespace-nowrap px-3 py-3 text-right align-top font-mono text-[11px] text-faint">{relTime(l.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-medium ${className}`}>{children}</th>
}
