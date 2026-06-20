/**
 * Tenant resolution for machine callers (Vapi voice platform, MCP clients).
 *
 * A request may carry `Authorization: Bearer <raw-api-key>`. We SHA-256 the raw
 * key and match it against `api_keys.key_hash` (keys are hashed at rest). A match
 * yields the principal: which `business_id` the connection acts as, and the scopes
 * it's allowed. No header → caller is anonymous and the agent falls back to the
 * demo tenant (see DEMO_BUSINESS_ID) so the URL is testable in Claude as-is.
 */
import { and, eq, isNull } from 'drizzle-orm'

import { createDb } from '../../../db/client'
import { apiKeys } from '../../../db/schema'
import type { ApiScope } from '../../../db/enums'

export type Principal = { businessId: string; scopes: ApiScope[] }

/** SHA-256 hex — the canonical hash for `api_keys.key_hash`. */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Resolve a raw API key to its principal, or null if unknown/revoked. */
export async function resolveApiKey(
  db: ReturnType<typeof createDb>,
  rawKey: string,
): Promise<Principal | null> {
  const hash = await sha256Hex(rawKey)
  const row = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)),
  })
  if (!row) return null
  return { businessId: row.businessId, scopes: row.scopes }
}

/** Parse a `Bearer <token>` header value. */
export function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const m = /^bearer\s+(.+)$/i.exec(authHeader.trim())
  return m ? m[1]!.trim() : null
}
