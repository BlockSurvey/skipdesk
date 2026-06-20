import { cookies } from 'next/headers'
import { importJWK, jwtVerify } from 'jose'
import { WORKER_BASE } from './api'
import { JWT_PUBLIC_JWK, JWT_ALG, JWT_ISSUER, JWT_AUDIENCE } from './jwt-public-key'

/**
 * Server-only auth helpers. The session is a 14-day ES256 JWT in an httpOnly
 * cookie; it's verified LOCALLY with the public key (no round-trip to the worker)
 * — the clean, stateless mechanism. Data calls still go to the worker with the
 * token as a Bearer credential, where the worker re-verifies the same signature.
 */
export const SESSION_COOKIE = 'sd_session'
export const SESSION_MAX_AGE = 14 * 24 * 60 * 60 // 14 days, matches the JWT TTL

export type SessionUser = { id: string; email: string; name: string | null; role: string; business_id: string | null }
export type Session = { user: SessionUser; onboarded: boolean }

let pubKey: Promise<Awaited<ReturnType<typeof importJWK>>> | null = null
const publicKey = () => (pubKey ??= importJWK(JWT_PUBLIC_JWK, JWT_ALG))

export function getSessionToken(): string | undefined {
  return cookies().get(SESSION_COOKIE)?.value
}

/** Verify the session JWT with the public key and return its claims, or null. */
export async function getSession(): Promise<Session | null> {
  const token = getSessionToken()
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, await publicKey(), { issuer: JWT_ISSUER, audience: JWT_AUDIENCE })
    const p = payload as { sub: string; email: string; name: string | null; role: string; bid: string | null; onboarded: boolean }
    return {
      user: { id: p.sub, email: p.email, name: p.name ?? null, role: p.role, business_id: p.bid ?? null },
      onboarded: !!p.onboarded,
    }
  } catch {
    return null
  }
}

/** Authenticated server-side fetch to the worker, attaching the session token. */
export async function workerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getSessionToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
  return fetch(`${WORKER_BASE}${path}`, { ...init, headers, cache: 'no-store' })
}
