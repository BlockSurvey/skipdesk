/**
 * Dashboard auth endpoints (human owners, not machines):
 *   POST /auth/signup  { email, password, name? }  → create account + JWT
 *   POST /auth/login   { email, password }          → JWT
 *   POST /auth/logout                               → 204 (UI clears the cookie)
 *   GET  /auth/me                                   → { user, business, onboarded }
 *
 * The returned `session_token` is a 14-day ES256 JWT (see lib/jwt.ts). The Next
 * app stores it in an httpOnly cookie and verifies it locally with the public key.
 * Logout is stateless: the token isn't server-revoked, the UI just drops the cookie.
 * Email is normalized lowercase and globally unique; no email verification.
 */
import { eq } from 'drizzle-orm'

import { createDb } from '../../../db/client'
import { businesses, users } from '../../../db/schema'
import type { Business, User } from '../../../db/schema'
import { hashPassword, verifyPassword } from './lib/password'
import { issueToken, resolveAuth, sessionToken, type AuthedUser } from './lib/session'

type Env = { DB: D1Database; JWT_PRIVATE_JWK: string }

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS })

const normalizeEmail = (e: string) => e.trim().toLowerCase()
const emailLooksValid = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)

const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, role: u.role, business_id: u.businessId })
const publicBusiness = (b: Business | null) => (b ? { id: b.id, name: b.name, slug: b.slug, timezone: b.timezone } : null)
const authPayload = (a: AuthedUser) => ({ user: publicUser(a.user), business: publicBusiness(a.business), onboarded: a.onboarded })

export async function handleAuth(request: Request, env: Env, path: string): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const db = createDb(env.DB)

  // ── POST /auth/signup ──────────────────────────────────────────────────────
  if (path === '/auth/signup' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { email?: string; password?: string; name?: string } | null
    if (!body) return json({ error: 'invalid JSON body' }, 400)
    const email = normalizeEmail(body.email ?? '')
    const password = body.password ?? ''
    const name = (body.name ?? '').trim() || null
    if (!emailLooksValid(email)) return json({ error: 'a valid email is required' }, 400)
    if (password.length < 8) return json({ error: 'password must be at least 8 characters' }, 400)

    const existing = await db.query.users.findFirst({ where: eq(users.email, email) })
    if (existing) return json({ error: 'an account with this email already exists' }, 409)

    const [user] = await db
      .insert(users)
      .values({ email, name, role: 'owner', passwordHash: await hashPassword(password) })
      .returning()
    const token = await issueToken(env, user!, null)
    return json({ session_token: token, ...authPayload({ user: user!, business: null, onboarded: false }) }, 201)
  }

  // ── POST /auth/login ───────────────────────────────────────────────────────
  if (path === '/auth/login' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null
    if (!body) return json({ error: 'invalid JSON body' }, 400)
    const email = normalizeEmail(body.email ?? '')
    const user = await db.query.users.findFirst({ where: eq(users.email, email) })
    if (!user || !(await verifyPassword(body.password ?? '', user.passwordHash))) {
      return json({ error: 'invalid email or password' }, 401)
    }
    const business = user.businessId
      ? (await db.query.businesses.findFirst({ where: eq(businesses.id, user.businessId) })) ?? null
      : null
    const token = await issueToken(env, user, business)
    return json({ session_token: token, ...authPayload({ user, business, onboarded: !!business }) })
  }

  // ── POST /auth/logout ──────────────────────────────────────────────────────
  if (path === '/auth/logout' && request.method === 'POST') {
    // Stateless tokens — nothing to revoke server-side; the UI clears the cookie.
    return new Response(null, { status: 204, headers: CORS })
  }

  // ── GET /auth/me ───────────────────────────────────────────────────────────
  if (path === '/auth/me' && request.method === 'GET') {
    const me = await resolveAuth(db, env, sessionToken(request))
    if (!me) return json({ error: 'not authenticated' }, 401)
    return json(authPayload(me))
  }

  return json({ error: 'not found' }, 404)
}
