/**
 * Stateless Streamable HTTP MCP endpoint.
 *
 * Every POST is self-contained: we resolve the tenant, dispatch the JSON-RPC
 * message against the full tool registry, and reply with plain JSON. There is no
 * server session to expire — which is exactly what makes remote clients (Claude)
 * reliable: a tool can never be "not registered" between listing and calling.
 */
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

import { createDb } from '../../../db/client'
import { API_SCOPES } from '../../../db/enums'
import type { Principal } from './auth'
import { createRegistrar, DEMO_BUSINESS_ID, runTool, type ToolCtx, type ToolDef } from './context'
import { registerAppointmentTools } from './tools/appointments'
import { registerCallTools } from './tools/calls'
import { registerEscalationTools } from './tools/escalation'
import { registerInfoTools } from './tools/info'
import { registerLeadTools } from './tools/leads'

export function buildRegistry(): ToolDef[] {
  const tools: ToolDef[] = []
  const def = createRegistrar(tools)
  registerInfoTools(def)
  registerLeadTools(def)
  registerAppointmentTools(def)
  registerEscalationTools(def)
  registerCallTools(def)
  return tools
}

const REGISTRY = buildRegistry()
const TOOLS_LIST = REGISTRY.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: zodToJsonSchema(z.object(t.shape), { $refStrategy: 'none' }),
}))

type Env = { DB: D1Database }

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, mcp-session-id',
  'access-control-expose-headers': 'Mcp-Session-Id',
}

const SERVER_INFO = { name: 'skip-desk', version: '0.1.0' }

export async function handleMcp(request: Request, env: Env, principal: Principal | null): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  // No server-initiated streaming in stateless mode.
  if (request.method === 'GET') return new Response('Method Not Allowed', { status: 405, headers: CORS })
  if (request.method === 'DELETE') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { headers: CORS })
  }

  const ctx: ToolCtx = {
    db: createDb(env.DB),
    businessId: principal?.businessId ?? DEMO_BUSINESS_ID,
    scopes: principal?.scopes ?? [...API_SCOPES],
  }

  const isBatch = Array.isArray(body)
  const msgs = (isBatch ? body : [body]) as Record<string, unknown>[]
  const out: unknown[] = []
  for (const m of msgs) {
    const r = await dispatch(m, ctx)
    if (r) out.push(r)
  }
  if (out.length === 0) return new Response(null, { status: 202, headers: CORS })
  return Response.json(isBatch ? out : out[0], { headers: CORS })
}

async function dispatch(m: Record<string, unknown>, ctx: ToolCtx) {
  const id = m.id as string | number | null | undefined
  const method = m.method as string
  const params = (m.params ?? {}) as Record<string, unknown>
  const hasId = id !== undefined && id !== null
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id, result })
  const err = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: (params.protocolVersion as string) ?? '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      })
    case 'tools/list':
      return reply({ tools: TOOLS_LIST })
    case 'tools/call': {
      const def = REGISTRY.find((t) => t.name === params.name)
      if (!def) return hasId ? err(-32602, `unknown tool: ${String(params.name)}`) : null
      let parsed: unknown
      try {
        parsed = z.object(def.shape).parse(params.arguments ?? {})
      } catch (e) {
        const msg =
          e instanceof z.ZodError
            ? e.errors.map((x) => `${x.path.join('.') || '(arg)'}: ${x.message}`).join('; ')
            : String(e)
        return reply({ content: [{ type: 'text', text: `error: invalid arguments — ${msg}` }], isError: true })
      }
      return reply(await runTool(def, parsed, ctx))
    }
    case 'ping':
      return reply({})
    case 'prompts/list':
      return reply({ prompts: [] })
    case 'resources/list':
      return reply({ resources: [] })
    case 'resources/templates/list':
      return reply({ resourceTemplates: [] })
    default:
      // Notifications (no id) need no response; unknown requests get an error.
      return hasId ? err(-32601, `method not found: ${method}`) : null
  }
}
