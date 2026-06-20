/** Typed client for the Skip Desk worker's read API. */

export const WORKER_BASE =
  process.env.NEXT_PUBLIC_MCP_BASE ?? 'https://skip-desk-mcp.sweet-night-5b17.workers.dev'

export type BusinessSummary = {
  id: string
  name: string
  slug: string
  timezone: string
  status: string
  counts: { calls: number; leads: number; appointments: number }
}

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

export async function getBusinesses(): Promise<BusinessSummary[]> {
  const res = await fetch(`${WORKER_BASE}/api/businesses`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`businesses ${res.status}`)
  return (await res.json()).businesses
}

export async function getDashboard(id: string): Promise<Dashboard | null> {
  const res = await fetch(`${WORKER_BASE}/api/businesses/${id}/dashboard`, { cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`dashboard ${res.status}`)
  return res.json()
}
