/**
 * Public verification key for Skip Desk session JWTs (ES256 / P-256).
 *
 * This is the PUBLIC half of the signing keypair — safe to commit and distribute.
 * The worker signs session tokens with the matching PRIVATE key (kept as the
 * `JWT_PRIVATE_JWK` worker secret, never committed); the UI (and the worker)
 * verify signatures with this public key alone. Rotating keys = new keypair +
 * bump the `kid`.
 */
export const JWT_PUBLIC_JWK = {
  kty: 'EC',
  crv: 'P-256',
  x: '-oVkybAlGLcYds7l13UADVUB1uspOE7TDqL220ZYF_4',
  y: 'VBaGfX5PP31jIHSe90_wQ39N8syFtMparJowJaVjtKw',
  kid: 'skipdesk-es256-1',
  alg: 'ES256',
  use: 'sig',
} as const

export const JWT_ALG = 'ES256'
export const JWT_ISSUER = 'skip-desk'
export const JWT_AUDIENCE = 'skip-desk-dashboard'
/** 14 days, per product requirement. */
export const JWT_TTL_SECONDS = 14 * 24 * 60 * 60
