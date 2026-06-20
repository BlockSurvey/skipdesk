/**
 * Web voice widget — the public, multi-tenant surface for the Vapi assistant.
 *
 * One SHARED Vapi assistant is made tenant-aware at two edges:
 *   GET  /widget/config        (public)  → per-business context the browser injects
 *                                           as Vapi variableValues at call start.
 *   POST /api/v1/webhooks/vapi (signed)  → end-of-call-report → write the lead + call
 *                                           into the right tenant at call end.
 *
 * Security: the browser only ever holds non-secrets (Vapi public key + assistant id).
 * `/widget/config` returns ONLY public-facing info (name, hours, FAQ summary — what the
 * agent says aloud), never leads/calls/KB. The lead is written server-side in the webhook,
 * where business_id comes from the call payload and flows through the existing
 * tenant-scoped writers — so there is no browser-trusted read path.
 */
import { and, asc, eq } from 'drizzle-orm'

import { createDb } from '../../../db/client'
import { businessFaqs, businessHours, businesses, calls, leads, phoneNumbers } from '../../../db/schema'
import type { Business } from '../../../db/schema'
import { businessCountryCode, resolveContact } from './lib/customer'
import { formatLocalDate, formatLocalDateTime, formatLocalTime } from './lib/time'
import { normalizePhone, toIsoUtc } from './lib/validate'

export type WidgetEnv = {
  DB: D1Database
  VAPI_PUBLIC_KEY?: string
  VAPI_ASSISTANT_ID?: string
  VAPI_WEBHOOK_SECRET?: string
  /** Shared inbound number (string E.164) shown until each business gets its own. */
  VAPI_PHONE_NUMBER?: string
}

/** A business's own inbound number if provisioned, else the shared platform number. */
export async function resolvePhoneNumber(db: Db, businessId: string, env: WidgetEnv): Promise<string | null> {
  const own = await db.query.phoneNumbers.findFirst({ where: eq(phoneNumbers.businessId, businessId) })
  return own?.e164 ?? env.VAPI_PHONE_NUMBER ?? null
}

type Db = ReturnType<typeof createDb>

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, X-Vapi-Secret',
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS })

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** One-line, human-readable opening-hours summary for the agent prompt. */
function hoursSummary(rows: { dayOfWeek: number; openTime: string | null; closeTime: string | null; closed: boolean }[]): string {
  if (!rows.length) return 'Hours not specified.'
  return rows
    .slice()
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((h) => (h.closed || !h.openTime ? `${DOW[h.dayOfWeek]}: closed` : `${DOW[h.dayOfWeek]}: ${h.openTime}–${h.closeTime}`))
    .join(', ')
}

/** Flatten active FAQs to bounded Q/A text the agent can answer from. */
function faqSummary(rows: { question: string; answer: string }[], cap = 1800): string {
  if (!rows.length) return 'No FAQs provided.'
  let out = ''
  for (const f of rows) {
    const line = `Q: ${f.question}\nA: ${f.answer}\n`
    if (out.length + line.length > cap) break
    out += line
  }
  return out.trim()
}

/** Build the per-business Vapi variableValues from public config only. */
async function buildVariableValues(db: Db, biz: Business): Promise<Record<string, string>> {
  const [hours, faqs] = await Promise.all([
    db.query.businessHours.findMany({ where: eq(businessHours.businessId, biz.id), orderBy: asc(businessHours.dayOfWeek) }),
    db.query.businessFaqs.findMany({ where: and(eq(businessFaqs.businessId, biz.id), eq(businessFaqs.isActive, true)) }),
  ])
  const agentName = biz.agentName?.trim() || 'Sam'
  // Greeting declares the business name AND that this is its assistant, up front,
  // so the caller knows who they reached and that they're talking to an AI agent.
  const greeting =
    biz.greeting?.trim() ||
    `Hi, you've reached ${biz.name}. This is ${agentName}, the ${biz.name} virtual assistant. How can I help you today?`

  // Ground the agent in "now" IN THE BUSINESS TIMEZONE. Without this the LLM guesses
  // today's date and drifts on weekdays (the off-by-2-days bug). Computed server-side
  // at config fetch; the call starts seconds later so this is fresh to the minute.
  const now = new Date()
  const tz = biz.timezone
  return {
    BUSINESS_NAME: biz.name,
    AGENT_NAME: agentName,
    GREETING: greeting,
    BUSINESS_HOURS: hoursSummary(hours),
    FAQ_SUMMARY: faqSummary(faqs),
    TIMEZONE: tz,
    CURRENT_DATE: formatLocalDate(now, tz), // "Monday, June 22, 2026"
    CURRENT_TIME: formatLocalTime(now, tz), // "2:15 PM"
    CURRENT_DATETIME: formatLocalDateTime(now, tz),
    businessId: biz.id,
  }
}

// ── GET /widget/config?slug=… (or ?businessId=…) ─────────────────────────────
export async function handleWidgetConfig(request: Request, env: WidgetEnv, url: URL): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'GET') return json({ error: 'GET required' }, 405)

  const db = createDb(env.DB)
  const slug = url.searchParams.get('slug')?.trim()
  const businessId = url.searchParams.get('businessId')?.trim()
  if (!slug && !businessId) return json({ error: 'pass ?slug= or ?businessId=' }, 400)

  const biz = await db.query.businesses.findFirst({
    where: slug ? eq(businesses.slug, slug) : eq(businesses.id, businessId!),
  })
  if (!biz) return json({ error: 'business not found' }, 404)

  // Public, non-secret payload. enabled:false is still 200 so the page shows a friendly state.
  return json({
    businessId: biz.id,
    slug: biz.slug,
    businessName: biz.name,
    enabled: !!biz.widgetEnabled,
    vapiPublicKey: env.VAPI_PUBLIC_KEY ?? null,
    vapiAssistantId: env.VAPI_ASSISTANT_ID ?? null,
    phoneNumber: await resolvePhoneNumber(db, biz.id, env),
    variableValues: await buildVariableValues(db, biz),
  })
}

// ── POST /api/v1/webhooks/vapi (signed) ──────────────────────────────────────
// Reads businessId from the call's variableValues and writes the lead + call into
// that tenant. Idempotent on the Vapi call id. Always 200s fast (Vapi retries on non-2xx).
type VapiBody = {
  message?: {
    type?: string
    call?: { id?: string; assistantOverrides?: { variableValues?: Record<string, unknown>; metadata?: Record<string, unknown> }; metadata?: Record<string, unknown> }
    assistantOverrides?: { variableValues?: Record<string, unknown> }
    analysis?: { summary?: string; structuredData?: Record<string, unknown> }
    transcript?: string
    summary?: string
    recordingUrl?: string
    startedAt?: string
    endedAt?: string
    durationSeconds?: number
    customer?: { number?: string }
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

export async function handleVapiWebhook(request: Request, env: WidgetEnv): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405)

  // Shared-secret auth. Vapi sends the configured secret on each server message.
  const secret = request.headers.get('x-vapi-secret') ?? request.headers.get('X-Vapi-Secret')
  if (!env.VAPI_WEBHOOK_SECRET || secret !== env.VAPI_WEBHOOK_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }

  const body = (await request.json().catch(() => null)) as VapiBody | null
  const msg = body?.message
  // Only act on the terminal report; ack everything else so Vapi stops retrying.
  if (!msg || msg.type !== 'end-of-call-report') return json({ ok: true, ignored: msg?.type ?? 'unknown' })

  const vars = msg.call?.assistantOverrides?.variableValues ?? msg.assistantOverrides?.variableValues ?? {}
  const meta = msg.call?.assistantOverrides?.metadata ?? msg.call?.metadata ?? {}
  const businessId = str(vars.businessId) ?? str((meta as Record<string, unknown>).businessId)
  if (!businessId) return json({ ok: true, ignored: 'no businessId' })

  const db = createDb(env.DB)
  const biz = await db.query.businesses.findFirst({ where: eq(businesses.id, businessId) })
  if (!biz) return json({ ok: true, ignored: 'unknown business' }) // don't leak; don't trigger retries

  // Structured-output lead fields (configured on the Vapi assistant's analysis plan).
  const sd = (msg.analysis?.structuredData ?? {}) as Record<string, unknown>
  const fullName = str(sd.fullName) ?? str(sd.name)
  const rawPhone = str(sd.phone) ?? str(sd.phoneNumber) ?? str(msg.customer?.number)
  const reason = str(sd.reason) ?? str(sd.intent) ?? str(msg.summary) ?? str(msg.analysis?.summary)
  const hasLead = !!(fullName && rawPhone)

  // 1) Upsert the call row (idempotent on the Vapi call id within the tenant).
  const callValues = {
    callerNumber: rawPhone ? normalizePhone(rawPhone, await businessCountryCode(db, businessId)) : null,
    startedAt: msg.startedAt ? toIsoUtc(msg.startedAt) : null,
    endedAt: msg.endedAt ? toIsoUtc(msg.endedAt) : null,
    durationSeconds: typeof msg.durationSeconds === 'number' ? Math.round(msg.durationSeconds) : null,
    outcome: hasLead ? ('lead_captured' as const) : ('info_provided' as const),
    summary: str(msg.summary) ?? str(msg.analysis?.summary) ?? null,
    transcript: str(msg.transcript) ?? null,
    recordingUrl: str(msg.recordingUrl) ?? null,
    rawPayload: body as unknown,
    updatedAt: new Date().toISOString(),
  }
  let callRow: typeof calls.$inferSelect | undefined
  const providerCallId = str(msg.call?.id)
  if (providerCallId) {
    const existing = await db.query.calls.findFirst({
      where: and(eq(calls.businessId, businessId), eq(calls.providerCallId, providerCallId)),
    })
    if (existing) [callRow] = await db.update(calls).set(callValues).where(eq(calls.id, existing.id)).returning()
  }
  if (!callRow) {
    ;[callRow] = await db
      .insert(calls)
      .values({ businessId, providerCallId: providerCallId ?? null, direction: 'inbound', ...callValues })
      .returning()
  }

  // 2) Capture the lead (dedup by phone) and link it to the call.
  if (hasLead) {
    const phone = normalizePhone(rawPhone!, await businessCountryCode(db, businessId))
    const { contact } = await resolveContact(db, businessId, { phone, name: fullName, callId: callRow?.id })
    const urgency = str(sd.urgency)
    await db
      .update(leads)
      .set({
        fullName: fullName ?? contact.fullName,
        reason: reason ?? contact.reason,
        preferredTime: str(sd.preferredTime) ?? contact.preferredTime,
        urgency: urgency === 'low' || urgency === 'high' ? urgency : contact.urgency,
        escalated: sd.escalate === true ? true : contact.escalated,
        callId: callRow?.id ?? contact.callId,
        status: contact.status === 'closed' ? 'new' : contact.status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(leads.id, contact.id))
  }

  return json({ ok: true, businessId, lead_captured: hasLead, call_id: callRow?.id ?? null })
}
