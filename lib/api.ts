/** Typed client for the Skip Desk worker's read API. */

export const WORKER_BASE =
  process.env.NEXT_PUBLIC_MCP_BASE ?? 'https://skip-desk-mcp.sweet-night-5b17.workers.dev'

export type Kpis = {
  totalCalls: number
  appointmentsBooked: number
  appointmentsUpcoming: number
  leadsTotal: number
  leadsOpen: number
  escalations: number
  conversionRate: number
  positiveRate: number
}

export type Tally = { key: string; count: number }
export type DayPoint = { date: string; count: number; booked: number }

export type Appointment = {
  id: string
  customer_name: string
  customer_phone: string
  customer_email: string | null
  service: string
  starts_at: string
  ends_at: string
  status: string
  location: string | null
  notes: string | null
}

export type Call = {
  id: string
  caller_number: string | null
  started_at: string | null
  duration_seconds: number | null
  outcome: string | null
  intent: string | null
  sentiment: string | null
  summary: string | null
  transcript: string | null
}

export type Lead = {
  id: string
  full_name: string
  phone: string
  email: string | null
  reason: string | null
  preferred_time: string | null
  urgency: string
  status: string
  escalated: boolean
  created_at: string
}

export type Dashboard = {
  business: { id: string; name: string; slug: string; timezone: string }
  kpis: Kpis
  charts: { outcomes: Tally[]; sentiments: Tally[]; leadsByStatus: Tally[]; callsByDay: DayPoint[] }
  appointments: Appointment[]
  calls: Call[]
  leads: Lead[]
  hours: { dayOfWeek: number; openTime: string | null; closeTime: string | null; closed: boolean }[]
}

export type HoursRow = { id?: string; day_of_week: number; open_time: string | null; close_time: string | null; closed: boolean }
export type FaqRow = { id?: string; question: string; answer: string }
export type EscalationRow = { id?: string; name: string; role: string | null; phone: string | null; email: string | null }

export type BusinessConfig = {
  business: {
    id: string; name: string; slug: string; timezone: string; status: string
    industry: string | null; phone: string | null; address: string | null
    agentName: string | null; greeting: string | null; defaultAppointmentMinutes: number
  }
  hours: { dayOfWeek: number; openTime: string | null; closeTime: string | null; closed: boolean }[]
  faqs: { id: string; question: string; answer: string }[]
  escalation: { id: string; name: string; role: string | null; phone: string | null; email: string | null }[]
  api_key: { name: string; created_at: string; revoked: boolean } | null
}

/** Authed dashboard for the logged-in owner's business (server-side; uses the session cookie). */
export async function getMyDashboard(): Promise<Dashboard | null> {
  const { workerFetch } = await import('./auth-server')
  const res = await workerFetch('/api/me/dashboard')
  if (res.status === 401 || res.status === 409) return null
  if (!res.ok) throw new Error(`dashboard ${res.status}`)
  return res.json()
}

/** Authed full config (profile + hours + faqs + escalation + key meta) for Settings. */
export async function getMyConfig(): Promise<BusinessConfig | null> {
  const { workerFetch } = await import('./auth-server')
  const res = await workerFetch('/api/me/config')
  if (!res.ok) return null
  return res.json()
}
