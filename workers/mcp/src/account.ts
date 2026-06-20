/**
 * Authenticated owner endpoints (session-gated). All routes resolve the business
 * from the logged-in user — never from the URL/body — preserving tenant isolation.
 *
 *   POST  /onboarding             create the business, seed hours, mint API key (once)
 *   GET   /api/me/dashboard       full analytics payload for the owner's business
 *   GET   /api/me/config          business + hours + faqs + escalation (for Settings)
 *   PATCH /api/me/business        update profile + agent preferences
 *   PUT   /api/me/hours           replace weekly hours
 *   PUT   /api/me/faqs            replace FAQs
 *   PUT   /api/me/escalation      replace escalation contacts
 *   POST  /api/me/key/rotate      revoke + mint a new API key (returned once)
 */
import { asc, eq } from 'drizzle-orm'

import { createDb } from '../../../db/client'
import { API_SCOPES } from '../../../db/enums'
import {
  apiKeys,
  businessFaqs,
  businessHours,
  businesses,
  escalationContacts,
  users,
} from '../../../db/schema'
import { sha256Hex } from './auth'
import { businessDashboard } from './dashboard'
import { newApiKey, slugify } from './register'
import { issueToken, resolveAuth, sessionToken, type AuthedUser } from './lib/session'

type Env = { DB: D1Database; JWT_PRIVATE_JWK: string }
type Db = ReturnType<typeof createDb>

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS })

/** Resolve the session or return a 401 response to short-circuit with. */
async function requireSession(db: Db, env: Env, request: Request): Promise<AuthedUser | Response> {
  const me = await resolveAuth(db, env, sessionToken(request))
  if (!me) return json({ error: 'not authenticated' }, 401)
  return me
}

/** Default hours: Mon–Fri 09:00–18:00, weekends closed. */
const defaultHours = (businessId: string) =>
  [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
    businessId,
    dayOfWeek: dow,
    openTime: dow >= 1 && dow <= 5 ? '09:00' : null,
    closeTime: dow >= 1 && dow <= 5 ? '18:00' : null,
    closed: !(dow >= 1 && dow <= 5),
  }))

/** Pick a globally-unique slug, suffixing -2, -3… on collision. */
async function uniqueSlug(db: Db, base: string): Promise<string> {
  const root = slugify(base) || 'business'
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`
    const taken = await db.query.businesses.findFirst({ where: eq(businesses.slug, candidate) })
    if (!taken) return candidate
  }
  return `${root}-${crypto.randomUUID().slice(0, 6)}`
}

type HoursRow = { day_of_week: number; open_time?: string | null; close_time?: string | null; closed?: boolean }

// ── POST /onboarding ─────────────────────────────────────────────────────────
export async function handleOnboarding(request: Request, env: Env, origin: string): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405)
  const db = createDb(env.DB)
  const me = await requireSession(db, env, request)
  if (me instanceof Response) return me
  if (me.business) return json({ error: 'this account already has a business' }, 409)

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string
        industry?: string
        timezone?: string
        phone?: string
        address?: string
        agentName?: string
        greeting?: string
        defaultAppointmentMinutes?: number
        hours?: HoursRow[]
      }
    | null
  if (!body) return json({ error: 'invalid JSON body' }, 400)
  const name = (body.name ?? '').trim()
  if (!name) return json({ error: 'business name is required' }, 400)
  const timezone = (body.timezone ?? 'UTC').trim()

  const slug = await uniqueSlug(db, name)
  const [biz] = await db
    .insert(businesses)
    .values({
      name,
      slug,
      timezone,
      status: 'active',
      industry: body.industry?.trim() || null,
      phone: body.phone?.trim() || null,
      address: body.address?.trim() || null,
      agentName: body.agentName?.trim() || null,
      greeting: body.greeting?.trim() || null,
      defaultAppointmentMinutes: Number.isFinite(body.defaultAppointmentMinutes)
        ? Number(body.defaultAppointmentMinutes)
        : 30,
    })
    .returning()

  await db.update(users).set({ businessId: biz!.id, role: 'owner' }).where(eq(users.id, me.user.id))

  const hours =
    Array.isArray(body.hours) && body.hours.length
      ? body.hours.map((h) => ({
          businessId: biz!.id,
          dayOfWeek: h.day_of_week,
          openTime: h.closed ? null : h.open_time ?? null,
          closeTime: h.closed ? null : h.close_time ?? null,
          closed: !!h.closed,
        }))
      : defaultHours(biz!.id)
  await db.insert(businessHours).values(hours)

  const rawKey = newApiKey()
  await db.insert(apiKeys).values({
    businessId: biz!.id,
    name: 'primary',
    keyHash: await sha256Hex(rawKey),
    scopes: [...API_SCOPES],
  })

  // Re-issue the token so it now reflects onboarded=true + the new business id.
  const token = await issueToken(env, { ...me.user, businessId: biz!.id, role: 'owner' }, biz!)

  return json(
    {
      business: { id: biz!.id, name: biz!.name, slug: biz!.slug, timezone: biz!.timezone },
      api_key: rawKey,
      mcp_url: `${origin}/mcp`,
      session_token: token,
    },
    201,
  )
}

// ── /api/me/* ────────────────────────────────────────────────────────────────
export async function handleAccountApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const db = createDb(env.DB)
  const me = await requireSession(db, env, request)
  if (me instanceof Response) return me
  if (!me.business) return json({ error: 'no business yet — complete onboarding first' }, 409)
  const bizId = me.business.id
  const path = url.pathname

  if (path === '/api/me/dashboard' && request.method === 'GET') {
    return businessDashboard(env, bizId)
  }

  if (path === '/api/me/config' && request.method === 'GET') {
    const [biz, hours, faqs, escalation, key] = await Promise.all([
      db.query.businesses.findFirst({ where: eq(businesses.id, bizId) }),
      db.query.businessHours.findMany({ where: eq(businessHours.businessId, bizId), orderBy: asc(businessHours.dayOfWeek) }),
      db.query.businessFaqs.findMany({ where: eq(businessFaqs.businessId, bizId) }),
      db.query.escalationContacts.findMany({ where: eq(escalationContacts.businessId, bizId), orderBy: asc(escalationContacts.priority) }),
      db.query.apiKeys.findFirst({ where: eq(apiKeys.businessId, bizId) }),
    ])
    return json({
      business: biz,
      hours,
      faqs,
      escalation,
      api_key: key ? { name: key.name, created_at: key.createdAt, revoked: !!key.revokedAt } : null,
    })
  }

  if (path === '/api/me/business' && request.method === 'PATCH') {
    const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!b) return json({ error: 'invalid JSON body' }, 400)
    const patch: Record<string, unknown> = {}
    if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim()
    if (typeof b.timezone === 'string' && b.timezone.trim()) patch.timezone = b.timezone.trim()
    for (const f of ['industry', 'phone', 'address', 'agentName', 'greeting'] as const) {
      if (f in b) patch[f] = typeof b[f] === 'string' && (b[f] as string).trim() ? (b[f] as string).trim() : null
    }
    if ('defaultAppointmentMinutes' in b && Number.isFinite(Number(b.defaultAppointmentMinutes))) {
      patch.defaultAppointmentMinutes = Number(b.defaultAppointmentMinutes)
    }
    if (Object.keys(patch).length) await db.update(businesses).set(patch).where(eq(businesses.id, bizId))
    const updated = await db.query.businesses.findFirst({ where: eq(businesses.id, bizId) })
    return json({ business: updated })
  }

  if (path === '/api/me/hours' && request.method === 'PUT') {
    const b = (await request.json().catch(() => null)) as { hours?: HoursRow[] } | null
    if (!b || !Array.isArray(b.hours)) return json({ error: 'expected { hours: [...] }' }, 400)
    await db.delete(businessHours).where(eq(businessHours.businessId, bizId))
    await db.insert(businessHours).values(
      b.hours.map((h) => ({
        businessId: bizId,
        dayOfWeek: h.day_of_week,
        openTime: h.closed ? null : h.open_time ?? null,
        closeTime: h.closed ? null : h.close_time ?? null,
        closed: !!h.closed,
      })),
    )
    return json({ ok: true })
  }

  if (path === '/api/me/faqs' && request.method === 'PUT') {
    const b = (await request.json().catch(() => null)) as { faqs?: { question?: string; answer?: string }[] } | null
    if (!b || !Array.isArray(b.faqs)) return json({ error: 'expected { faqs: [...] }' }, 400)
    const rows = b.faqs
      .filter((f) => (f.question ?? '').trim() && (f.answer ?? '').trim())
      .map((f) => ({ businessId: bizId, question: f.question!.trim(), answer: f.answer!.trim() }))
    await db.delete(businessFaqs).where(eq(businessFaqs.businessId, bizId))
    if (rows.length) await db.insert(businessFaqs).values(rows)
    return json({ ok: true, count: rows.length })
  }

  if (path === '/api/me/escalation' && request.method === 'PUT') {
    const b = (await request.json().catch(() => null)) as
      | { contacts?: { name?: string; role?: string; phone?: string; email?: string }[] }
      | null
    if (!b || !Array.isArray(b.contacts)) return json({ error: 'expected { contacts: [...] }' }, 400)
    const rows = b.contacts
      .filter((c) => (c.name ?? '').trim())
      .map((c, i) => ({
        businessId: bizId,
        name: c.name!.trim(),
        role: c.role?.trim() || null,
        phone: c.phone?.trim() || null,
        email: c.email?.trim() || null,
        priority: i,
      }))
    await db.delete(escalationContacts).where(eq(escalationContacts.businessId, bizId))
    if (rows.length) await db.insert(escalationContacts).values(rows)
    return json({ ok: true, count: rows.length })
  }

  if (path === '/api/me/key/rotate' && request.method === 'POST') {
    await db.delete(apiKeys).where(eq(apiKeys.businessId, bizId))
    const rawKey = newApiKey()
    await db.insert(apiKeys).values({ businessId: bizId, name: 'primary', keyHash: await sha256Hex(rawKey), scopes: [...API_SCOPES] })
    return json({ api_key: rawKey })
  }

  return json({ error: 'not found' }, 404)
}
