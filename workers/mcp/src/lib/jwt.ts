/**
 * Session JWTs — ES256 (asymmetric). The worker SIGNS with the private key
 * (`JWT_PRIVATE_JWK` secret); anyone can VERIFY with the public key (committed in
 * the app at lib/jwt-public-key.ts and derived here from the private JWK). This
 * lets the UI verify a session locally — no round-trip — which is the clean,
 * stateless authentication mechanism.
 */
import { SignJWT, jwtVerify, importJWK, type JWTPayload } from 'jose'

type Key = Awaited<ReturnType<typeof importJWK>>

const ALG = 'ES256'
const ISSUER = 'skip-desk'
const AUDIENCE = 'skip-desk-dashboard'
const TTL_SECONDS = 14 * 24 * 60 * 60 // 14 days
const KID = 'skipdesk-es256-1'

type Env = { JWT_PRIVATE_JWK: string }

/** What we put in (and read out of) a session token, beyond the standard JWT claims. */
export type SessionInput = {
  sub: string
  email: string
  name: string | null
  role: string
  bid: string | null // business id (null until onboarded)
  onboarded: boolean
}
export type SessionClaims = JWTPayload & SessionInput

let cached: { priv: Key; pub: Key } | null = null
async function keys(env: Env) {
  if (cached) return cached
  const jwk = JSON.parse(env.JWT_PRIVATE_JWK)
  const priv = await importJWK(jwk, ALG)
  const { d: _omit, ...pubJwk } = jwk // public half = private JWK minus the secret `d`
  const pub = await importJWK(pubJwk, ALG)
  cached = { priv, pub }
  return cached
}

/** Sign a 14-day session token. */
export async function signSession(env: Env, claims: SessionInput): Promise<string> {
  const { priv } = await keys(env)
  return new SignJWT({ email: claims.email, name: claims.name, role: claims.role, bid: claims.bid, onboarded: claims.onboarded })
    .setProtectedHeader({ alg: ALG, kid: KID, typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(priv)
}

/** Verify signature + claims; returns the payload or null. */
export async function verifyToken(env: Env, token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, (await keys(env)).pub, { issuer: ISSUER, audience: AUDIENCE })
    return payload as SessionClaims
  } catch {
    return null
  }
}
