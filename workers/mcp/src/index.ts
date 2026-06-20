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

export type Env = {
  DB: D1Database
  MCP_OBJECT: DurableObjectNamespace
  /** ES256 private signing key (JWK JSON) for dashboard session JWTs. */
  JWT_PRIVATE_JWK: string
  /** R2 bucket for raw uploaded knowledge-base document blobs. */
  DOCS: R2Bucket
  /** Workers AI binding — toMarkdown conversion + bge text embeddings. */
  AI: Ai
}

type Props = { businessId?: string; scopes?: ApiScope[] }

/** Legacy SSE transport. Shares the exact same tool registry as the stateless path. */
export class SkipDeskMCP extends McpAgent<Env, unknown, Props> {
  server = new McpServer({ name: 'skip-desk', version: '0.1.0' })

  async init() {
    const getCtx = (): ToolCtx => ({
      db: createDb(this.env.DB),
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
    // ── Dashboard auth (human owners) — session-cookie / bearer based ──────────
    if (url.pathname.startsWith('/auth/')) {
      return handleAuth(request, env, url.pathname)
    }
    if (url.pathname === '/onboarding') {
      return handleOnboarding(request, env, url.origin)
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
