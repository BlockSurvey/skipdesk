/**
 * Mid-call tenant resolution for the Vapi MCP tool path.
 *
 * Vapi does NOT forward a call's `variableValues` (where we stash `businessId`)
 * into MCP tool requests — the only per-call context it injects is the
 * `X-Call-Id` header. So to attribute a mid-call tool action to the right
 * business we take that call id and ask Vapi for the call, reading `businessId`
 * back from the call's `assistantOverrides.variableValues`.
 *
 * Why this is safe (and respects "business_id comes from an authenticated
 * principal, never request input"): the lookup is a server-to-server call
 * authenticated with our `VAPI_PRIVATE_KEY`. The caller can't spoof the
 * businessId — it comes from Vapi's own record of the call. A static shared
 * secret header (`MCP_TOOL_SECRET`) additionally gates the endpoint so a leaked
 * call id alone can't be replayed against `/mcp`.
 *
 * Mirrors the webhook design (shared secret authenticates "this is Vapi"; the
 * non-secret businessId rides along).
 */
import { API_SCOPES } from '../../../db/enums'
import type { Principal } from './auth'

const VAPI_API = 'https://api.vapi.ai'

type VapiCall = {
  assistantOverrides?: { variableValues?: Record<string, unknown> }
  metadata?: Record<string, unknown>
}

/** Small per-isolate cache so a call's repeated tool invocations don't each hit Vapi. */
const CACHE = new Map<string, { businessId: string; expires: number }>()
const TTL_MS = 10 * 60 * 1000

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/**
 * Resolve the business behind a Vapi call id, or null if it can't be determined
 * (missing key, unknown call, no businessId on the call). On success the
 * principal is granted the full voice-tool scope set — it IS the business acting
 * on its own data.
 */
export async function resolveVapiCallPrincipal(
  callId: string,
  privateKey: string | undefined,
  now: number,
): Promise<Principal | null> {
  if (!privateKey) return null

  const cached = CACHE.get(callId)
  if (cached && cached.expires > now) {
    return { businessId: cached.businessId, scopes: [...API_SCOPES] }
  }

  let res: Response
  try {
    res = await fetch(`${VAPI_API}/call/${encodeURIComponent(callId)}`, {
      headers: { authorization: `Bearer ${privateKey}` },
    })
  } catch {
    return null
  }
  if (!res.ok) return null

  const call = (await res.json().catch(() => null)) as VapiCall | null
  if (!call) return null

  const businessId =
    str(call.assistantOverrides?.variableValues?.businessId) ?? str(call.metadata?.businessId)
  if (!businessId) return null

  CACHE.set(callId, { businessId, expires: now + TTL_MS })
  return { businessId, scopes: [...API_SCOPES] }
}
