/** Display helpers — all times shown in the business's own timezone. */

export function fmtTime(iso: string | null, tz: string): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso))
}

export function fmtDate(iso: string | null, tz: string): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: 'short' }).format(new Date(iso))
}

export function fmtDateTime(iso: string | null, tz: string): string {
  if (!iso) return '—'
  return `${fmtDate(iso, tz)} · ${fmtTime(iso, tz)}`
}

export function relTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

export function fmtDuration(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m ? `${m}m ${s}s` : `${s}s`
}

export const OUTCOME_LABEL: Record<string, string> = {
  info_provided: 'Info given',
  appointment_booked: 'Booked',
  lead_captured: 'Lead',
  escalated: 'Escalated',
  transferred: 'Transferred',
  abandoned: 'Abandoned',
}

export const OUTCOME_COLOR: Record<string, string> = {
  info_provided: 'var(--steel)',
  appointment_booked: 'var(--teal)',
  lead_captured: 'var(--amber)',
  escalated: 'var(--rose)',
  transferred: '#b794f6',
  abandoned: 'var(--faint)',
}

export const SENTIMENT_COLOR: Record<string, string> = {
  positive: 'var(--teal)',
  neutral: 'var(--steel)',
  negative: 'var(--rose)',
}

export const STATUS_COLOR: Record<string, string> = {
  confirmed: 'var(--teal)',
  pending: 'var(--amber)',
  completed: 'var(--steel)',
  cancelled: 'var(--faint)',
  no_show: 'var(--rose)',
  new: 'var(--amber)',
  contacted: 'var(--steel)',
  scheduled: 'var(--teal)',
  closed: 'var(--faint)',
}

export const URGENCY_COLOR: Record<string, string> = {
  high: 'var(--rose)',
  normal: 'var(--steel)',
  low: 'var(--faint)',
}

export const DOC_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
}

export const DOC_STATUS_COLOR: Record<string, string> = {
  pending: 'var(--faint)',
  processing: 'var(--amber)',
  ready: 'var(--teal)',
  failed: 'var(--rose)',
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}
