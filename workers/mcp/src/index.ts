/**
 * Skip Desk MCP server — Cloudflare Worker over D1.
 *
 * /mcp  — STATELESS Streamable HTTP (see mcp.ts). The reliable path for remote
 *         clients (Claude, Vapi): no session to go stale, so a tool is never
 *         "not registered" between listing and calling.
 * /sse  — legacy SSE transport via the Agents SDK McpAgent (Durable Object).
 * /register, /api/businesses — onboarding + read-only dashboard API.
 *
 * Tenant: `Authorization: Bearer <api-key>` → api_keys → business_id + scopes.
 * No header → demo tenant (testing only).
 */
import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { createDb } from '../../../db/client'
import { API_SCOPES, type ApiScope } from '../../../db/enums'
import { bearerToken, resolveApiKey, type Principal } from './auth'
import { DEMO_BUSINESS_ID, mountOnServer, type ToolCtx } from './context'
import { buildRegistry, handleMcp } from './mcp'
import { handleRegister } from './register'
import { handleAuth } from './authRoutes'
import { handleAccountApi, handleOnboarding } from './account'
import { handleDocumentsApi } from './documents'
import { handleVapiWebhook, handleWidgetConfig } from './widget'
import { resolveVapiCallPrincipal } from './vapiTenant'

export type Env = {
  DB: D1Database
  MCP_OBJECT: DurableObjectNamespace
  /** ES256 private signing key (JWK JSON) for dashboard session JWTs. */
  JWT_PRIVATE_JWK: string
  /** R2 bucket for raw uploaded knowledge-base document blobs. */
  DOCS: R2Bucket
  /** Workers AI binding — toMarkdown conversion + bge text embeddings. */
  AI: Ai
  /** Vapi web voice widget — public assistant key (browser-safe by design). */
  VAPI_PUBLIC_KEY?: string
  /** Vapi assistant id the widget connects to (shared across tenants). */
  VAPI_ASSISTANT_ID?: string
  /** Shared secret Vapi sends on server messages (verifies the end-of-call webhook). */
  VAPI_WEBHOOK_SECRET?: string
  /** Shared inbound phone number (E.164) shown until each business gets its own. */
  VAPI_PHONE_NUMBER?: string
  /** Vapi private API key — lets the worker look a call up to find its tenant (mid-call MCP). */
  VAPI_PRIVATE_KEY?: string
  /** Static shared secret Vapi's MCP tool sends (X-Skipdesk-Secret) to gate the call-id tenant path. */
  MCP_TOOL_SECRET?: string
}

type Props = { businessId?: string; scopes?: ApiScope[] }

/** Legacy SSE transport. Shares the exact same tool registry as the stateless path. */
export class SkipDeskMCP extends McpAgent<Env, unknown, Props> {
  server = new McpServer({ name: 'skip-desk', version: '0.1.0' })

  async init() {
    const getCtx = (): ToolCtx => ({
      db: createDb(this.env.DB),
      ai: this.env.AI,
      businessId: this.props?.businessId ?? DEMO_BUSINESS_ID,
      scopes: this.props?.scopes ?? [...API_SCOPES],
    })
    mountOnServer(this.server, buildRegistry(), getCtx)
  }
}

const landingPage = (origin: string) =>
  `Skip Desk MCP server

Register a business (get a unique API key):
  POST ${origin}/register   { "name": "...", "timezone": "Asia/Kolkata" }

Connect an MCP client (Claude, Vapi) to:
  Streamable HTTP:  ${origin}/mcp
  SSE (legacy):     ${origin}/sse

Auth: send "Authorization: Bearer <api-key>" to act as that business.
No header → demo tenant (testing only).
`

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(landingPage(url.origin), { headers: { 'content-type': 'text/plain' } })
    }
    if (url.pathname === '/register') {
      return handleRegister(request, env, url.origin)
    }
    // ── Web voice widget — public config + signed Vapi webhook ─────────────────
    // Both are matched BEFORE the API-key/tenant block: /widget/config is public,
    // and the webhook authenticates with the shared X-Vapi-Secret, not a Bearer key.
    if (url.pathname === '/widget/config') {
      return handleWidgetConfig(request, env, url)
    }
    if (url.pathname === '/api/v1/webhooks/vapi') {
      return handleVapiWebhook(request, env)
    }
    // ── Dashboard auth (human owners) — session-cookie / bearer based ──────────
    if (url.pathname.startsWith('/auth/')) {
      return handleAuth(request, env, url.pathname)
    }
    if (url.pathname === '/onboarding') {
      return handleOnboarding(request, env, url.origin)
    }
    // Knowledge-base document routes — more specific, so matched before the
    // generic /api/me handler below.
    if (url.pathname.startsWith('/api/me/documents') || url.pathname === '/api/me/knowledge/search') {
      return handleDocumentsApi(request, env, url, ctx)
    }
    if (url.pathname.startsWith('/api/me')) {
      return handleAccountApi(request, env, url)
    }

    // Resolve tenant from the API key (if any).
    const token = bearerToken(request.headers.get('authorization'))
    let principal: Principal | null = null
    if (token) {
      principal = await resolveApiKey(createDb(env.DB), token)
      if (!principal) {
        return Response.json({ error: 'invalid or revoked API key' }, { status: 401 })
      }
    } else {
      // Mid-call Vapi MCP tool path: no Bearer key, but Vapi injects X-Call-Id.
      // If the static shared secret matches, look the call up to find its tenant.
      const callId = request.headers.get('x-call-id')
      const toolSecret = request.headers.get('x-skipdesk-secret')
      const gateOk = !env.MCP_TOOL_SECRET || toolSecret === env.MCP_TOOL_SECRET
      if (callId && gateOk) {
        principal = await resolveVapiCallPrincipal(callId, env.VAPI_PRIVATE_KEY, Date.now())
      }
    }

    // Stateless Streamable HTTP — the primary, reliable transport.
    if (url.pathname.startsWith('/mcp')) {
      return handleMcp(request, env, principal)
    }

    // Legacy SSE transport (Durable-Object backed).
    if (url.pathname.startsWith('/sse')) {
      if (principal) (ctx as unknown as { props: Props }).props = principal
      return SkipDeskMCP.serveSSE('/sse').fetch(request, env, ctx)
    }

    return new Response('Not found', { status: 404 })
  },
}
