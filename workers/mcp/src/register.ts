/**
 * Business onboarding (self-serve). `POST /register` creates a tenant with a
 * proper UUID, default opening hours, and a unique API key (returned ONCE).
 * The business configures that key in their LLM / voice agent; from then on
 * every MCP call carries `Authorization: Bearer <key>`, so all writes are
 * scoped to — and can only touch — that business's data.
 *
 * The future UI registration page is just a form that POSTs to this endpoint.
 */
import { eq } from 'drizzle-orm'

import { createDb } from '../../../db/client'
import { API_SCOPES } from '../../../db/enums'
import { businessHours, businesses, apiKeys, escalationContacts } from '../../../db/schema'
import { sha256Hex } from './auth'

type Env = { DB: D1Database }

type RegisterBody = {
  name?: string
  timezone?: string
  slug?: string
  locale?: string
  escalation?: { name?: string; role?: string; phone?: string; email?: string }
}

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'access-control-allow-origin': '*' } })

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60)

/** sk_live_<48 hex> — opaque, high-entropy, shown to the business exactly once. */
function newApiKey(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return 'sk_live_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function handleRegister(request: Request, env: Env, origin: string): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'POST a JSON body: { name, timezone, slug?, locale?, escalation? }' }, 405)
  }

  let body: RegisterBody
  try {
    body = (await request.json()) as RegisterBody
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const name = (body.name ?? '').trim()
  if (!name) return json({ error: 'name is required' }, 400)
  const timezone = (body.timezone ?? 'UTC').trim()
  const locale = (body.locale ?? 'en').trim()
  const slug = body.slug ? slugify(body.slug) : slugify(name)
  if (!slug) return json({ error: 'could not derive a slug; pass an explicit slug' }, 400)

  const db = createDb(env.DB)

  // slug is globally unique — reject duplicates rather than silently colliding.
  const existing = await db.query.businesses.findFirst({ where: eq(businesses.slug, slug) })
  if (existing) return json({ error: `slug "${slug}" is already taken; choose another` }, 409)

  const [biz] = await db.insert(businesses).values({ name, slug, timezone, locale, status: 'active' }).returning()

  // Default opening hours: Mon–Fri 09:00–18:00, weekends closed.
  await db.insert(businessHours).values(
    [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
      businessId: biz!.id,
      dayOfWeek: dow,
      openTime: dow >= 1 && dow <= 5 ? '09:00' : null,
      closeTime: dow >= 1 && dow <= 5 ? '18:00' : null,
      closed: !(dow >= 1 && dow <= 5),
    })),
  )

  if (body.escalation?.name) {
    await db.insert(escalationContacts).values({
      businessId: biz!.id,
      name: body.escalation.name,
      role: body.escalation.role ?? null,
      phone: body.escalation.phone ?? null,
      email: body.escalation.email ?? null,
      priority: 0,
    })
  }

  // Mint the key: store only its hash; return the raw value once.
  const rawKey = newApiKey()
  await db.insert(apiKeys).values({
    businessId: biz!.id,
    name: 'primary',
    keyHash: await sha256Hex(rawKey),
    scopes: [...API_SCOPES],
  })

  return json(
    {
      business: { id: biz!.id, name: biz!.name, slug: biz!.slug, timezone: biz!.timezone },
      api_key: rawKey,
      scopes: API_SCOPES,
      mcp_url: `${origin}/mcp`,
      how_to_use:
        'Configure your LLM/voice agent to connect to mcp_url over Streamable HTTP, sending header "Authorization: Bearer <api_key>". Store the key securely — it is shown only once.',
      next_steps: [
        'Add your real opening hours, FAQs, and escalation contacts (default hours are Mon–Fri 09:00–18:00).',
        'Point your Vapi/Retell assistant tools at this MCP server.',
      ],
    },
    201,
  )
}
