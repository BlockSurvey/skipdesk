/**
 * Password hashing for dashboard accounts — Cloudflare-native (Web Crypto).
 *
 * bcrypt/argon2 aren't available on Workers without WASM, so we use PBKDF2-
 * HMAC-SHA256 (the standard Workers-safe choice): a random per-user salt and a
 * high iteration count. The stored string is self-describing:
 *   pbkdf2$<iterations>$<saltB64>$<hashB64>
 * Verification re-derives with the embedded params and compares in constant time.
 */

const ITERATIONS = 100_000
const KEY_LEN = 32 // bytes
const HASH = 'SHA-256'

const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const byte of bytes) s += String.fromCharCode(byte)
  return btoa(s)
}
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: HASH }, key, KEY_LEN * 8)
  return new Uint8Array(bits)
}

/** Hash a plaintext password into a storable `pbkdf2$...` string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`
}

/** Constant-time comparison of two byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

/** Verify a plaintext password against a stored `pbkdf2$...` string. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations < 1) return false
  const salt = fromB64(parts[2]!)
  const expected = fromB64(parts[3]!)
  const actual = await derive(password, salt, iterations)
  return timingSafeEqual(actual, expected)
}
