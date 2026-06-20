/**
 * Read-only dashboard API consumed by the Next.js app. Returns everything the
 * operator needs for one business on one page: KPIs, appointment calendar,
 * callers + call summaries, and leads. Read-only and (for the demo) unauthenticated
 * — in production gate these behind an operator session/admin token.
 *
 *   GET /api/businesses                 → list (for the switcher)
 *   GET /api/businesses/:id/dashboard   → full per-business payload
 */
import { and, desc, eq, gte } from 'drizzle-orm'

import { createDb } from '../../../db/client'
import { appointments, businessHours, businesses, calls, leads } from '../../../db/schema'

type Env = { DB: D1Database }

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
}
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: CORS })

const daysAgoIso = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
const dayKey = (iso: string | null) => (iso ? iso.slice(0, 10) : null)

export async function listBusinesses(env: Env): Promise<Response> {
  const db = createDb(env.DB)
  const rows = await db.query.businesses.findMany({ orderBy: desc(businesses.createdAt) })
  const out = []
  for (const b of rows) {
    out.push({
      id: b.id,
      name: b.name,
      slug: b.slug,
      timezone: b.timezone,
      status: b.status,
      counts: {
        calls: await db.$count(calls, eq(calls.businessId, b.id)),
        leads: await db.$count(leads, eq(leads.businessId, b.id)),
        appointments: await db.$count(appointments, eq(appointments.businessId, b.id)),
      },
    })
  }
  return json({ businesses: out })
}

export async function businessDashboard(env: Env, id: string): Promise<Response> {
  const db = createDb(env.DB)
  const business = await db.query.businesses.findFirst({ where: eq(businesses.id, id) })
  if (!business) return json({ error: 'business not found' }, 404)

  const [callRows, apptRows, leadRows, hours] = await Promise.all([
    db.query.calls.findMany({
      where: and(eq(calls.businessId, id), gte(calls.startedAt, daysAgoIso(60))),
      orderBy: desc(calls.startedAt),
      limit: 500,
    }),
    db.query.appointments.findMany({ where: eq(appointments.businessId, id), orderBy: desc(appointments.startsAt), limit: 500 }),
    db.query.leads.findMany({ where: eq(leads.businessId, id), orderBy: desc(leads.createdAt), limit: 500 }),
    db.query.businessHours.findMany({ where: eq(businessHours.businessId, id) }),
  ])

  const now = Date.now()

  // ── aggregates ─────────────────────────────────────────────────────────────
  const tally = (rows: { [k: string]: unknown }[], key: string) => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const v = (r[key] as string) ?? 'unknown'
      m.set(v, (m.get(v) ?? 0) + 1)
    }
    return [...m.entries()].map(([k, count]) => ({ key: k, count }))
  }

  const outcomes = tally(callRows, 'outcome')
  const sentiments = tally(callRows, 'sentiment')
  const leadsByStatus = tally(leadRows, 'status')

  // calls per day (last 30d) with booked split
  const byDay = new Map<string, { count: number; booked: number }>()
  for (let i = 29; i >= 0; i--) byDay.set(daysAgoIso(i).slice(0, 10), { count: 0, booked: 0 })
  for (const c of callRows) {
    const k = dayKey(c.startedAt)
    if (k && byDay.has(k)) {
      const b = byDay.get(k)!
      b.count++
      if (c.outcome === 'appointment_booked') b.booked++
    }
  }
  const callsByDay = [...byDay.entries()].map(([date, v]) => ({ date, ...v }))

  const activeAppts = apptRows.filter((a) => a.status !== 'cancelled')
  const upcoming = activeAppts.filter((a) => new Date(a.startsAt).getTime() >= now)
  const positive = sentiments.find((s) => s.key === 'positive')?.count ?? 0

  const kpis = {
    totalCalls: callRows.length,
    appointmentsBooked: activeAppts.length,
    appointmentsUpcoming: upcoming.length,
    leadsTotal: leadRows.length,
    leadsOpen: leadRows.filter((l) => l.status === 'new' || l.status === 'contacted').length,
    escalations: leadRows.filter((l) => l.escalated).length + callRows.filter((c) => c.outcome === 'escalated').length,
    conversionRate: callRows.length ? Math.round((callRows.filter((c) => c.outcome === 'appointment_booked').length / callRows.length) * 100) : 0,
    positiveRate: callRows.length ? Math.round((positive / callRows.length) * 100) : 0,
  }

  return json({
    business: { id: business.id, name: business.name, slug: business.slug, timezone: business.timezone },
    kpis,
    charts: { outcomes, sentiments, leadsByStatus, callsByDay },
    appointments: apptRows.map((a) => ({
      id: a.id, customer_name: a.customerName, customer_phone: a.customerPhone, customer_email: a.customerEmail,
      service: a.service, starts_at: a.startsAt, ends_at: a.endsAt, status: a.status, location: a.location, notes: a.notes,
    })),
    calls: callRows.map((c) => ({
      id: c.id, caller_number: c.callerNumber, started_at: c.startedAt, duration_seconds: c.durationSeconds,
      outcome: c.outcome, intent: c.intent, sentiment: c.sentiment, summary: c.summary, transcript: c.transcript,
    })),
    leads: leadRows.map((l) => ({
      id: l.id, full_name: l.fullName, phone: l.phone, email: l.email, reason: l.reason, preferred_time: l.preferredTime,
      urgency: l.urgency, status: l.status, escalated: l.escalated, created_at: l.createdAt,
    })),
    hours,
  })
}

export function handleDashboardApi(request: Request, env: Env, url: URL): Response | Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (url.pathname === '/api/businesses') return listBusinesses(env)
  const m = url.pathname.match(/^\/api\/businesses\/([^/]+)\/dashboard$/)
  if (m) return businessDashboard(env, decodeURIComponent(m[1]!))
  return json({ error: 'not found' }, 404)
}
