/**
 * Session resolution for the dashboard. The credential is now a stateless ES256
 * JWT (see jwt.ts) carried in the `sd_session` httpOnly cookie or a Bearer header.
 * We verify the signature, then load the user + business from D1 (the user row is
 * the source of truth for which business they own, so a slightly stale token's
 * business claim never matters).
 */
import { eq } from 'drizzle-orm'

import { createDb } from '../../../../db/client'
import { users, businesses } from '../../../../db/schema'
import type { Business, User } from '../../../../db/schema'
import { signSession, verifyToken } from './jwt'

export const SESSION_COOKIE = 'sd_session'

type Db = ReturnType<typeof createDb>
type Env = { JWT_PRIVATE_JWK: string }

export type AuthedUser = { user: User; business: Business | null; onboarded: boolean }

/** Mint a fresh session token reflecting the user's current business state. */
export async function issueToken(env: Env, user: User, business: Business | null): Promise<string> {
  return signSession(env, {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    bid: business?.id ?? null,
    onboarded: !!business,
  })
}

/** Verify a token and load the authed user + business, or null if invalid/expired. */
export async function resolveAuth(db: Db, env: Env, token: string | null): Promise<AuthedUser | null> {
  if (!token) return null
  const claims = await verifyToken(env, token)
  if (!claims?.sub) return null
  const user = await db.query.users.findFirst({ where: eq(users.id, claims.sub) })
  if (!user) return null
  const business = user.businessId
    ? (await db.query.businesses.findFirst({ where: eq(businesses.id, user.businessId) })) ?? null
    : null
  return { user, business, onboarded: !!business }
}

/** Extract the token from a request (Bearer header or sd_session cookie). */
export function sessionToken(request: Request): string | null {
  const auth = request.headers.get('authorization')
  const m = auth && /^bearer\s+(.+)$/i.exec(auth.trim())
  if (m) return m[1]!.trim()
  const cookie = request.headers.get('cookie') ?? ''
  const c = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookie)
  return c ? decodeURIComponent(c[1]!) : null
}
