import type { Lead } from '@/lib/api'
import { relTime, STATUS_COLOR, URGENCY_COLOR } from '@/lib/format'
import { Badge } from './Badge'

export function LeadsList({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) return <p className="py-8 text-center text-sm text-faint">No leads captured yet.</p>
  return (
    <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
      {leads.map((l) => (
        <div key={l.id} className="rounded-xl border border-line bg-panel p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-ink">{l.full_name}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              {l.escalated && <Badge label="escalated" color="var(--rose)" />}
              <Badge label={l.urgency} color={URGENCY_COLOR[l.urgency] ?? 'var(--faint)'} />
            </div>
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm text-muted">{l.reason ?? '—'}</p>
          <div className="mt-2.5 flex items-center justify-between font-mono text-[11px] text-faint">
            <span>{l.phone}</span>
            <span className="flex items-center gap-2">
              <span className="capitalize" style={{ color: STATUS_COLOR[l.status] }}>{l.status}</span>
              <span className="h-1 w-1 rounded-full bg-faint" />
              <span>{relTime(l.created_at)}</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
