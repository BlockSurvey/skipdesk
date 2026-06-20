/**
 * Tool registry + execution. Tools are registered as plain data (name, schema,
 * scope, handler) so the SAME definitions can be served two ways:
 *  - statelessly over Streamable HTTP (see mcp.ts) — robust for remote clients
 *    like Claude (no session to go stale), and
 *  - mounted on an McpServer for the legacy SSE transport.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ZodRawShape } from 'zod'

import type { Db } from '../../../db/client'
import type { ApiScope } from '../../../db/enums'
import { fail, type ToolResult } from './lib/respond'

/** The demo tenant used when a request arrives without a valid API key (mirrors db/seed.sql). */
export const DEMO_BUSINESS_ID = 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb'

export type ToolCtx = {
  db: Db
  businessId: string
  scopes: ApiScope[]
}

export type ToolDef = {
  name: string
  description: string
  shape: ZodRawShape
  scope: ApiScope | null
  // args are zod-validated before this runs; typed loosely to keep the registry simple.
  handler: (args: any, ctx: ToolCtx) => Promise<ToolResult>
}

export type Registrar = (
  name: string,
  description: string,
  shape: ZodRawShape,
  scope: ApiScope | null,
  handler: (args: any, ctx: ToolCtx) => Promise<ToolResult>,
) => void

/** Collects tool definitions into `tools`. */
export function createRegistrar(tools: ToolDef[]): Registrar {
  return (name, description, shape, scope, handler) => {
    tools.push({ name, description, shape, scope, handler })
  }
}

/** Run one tool with uniform scope-checking + error handling. */
export async function runTool(def: ToolDef, args: unknown, ctx: ToolCtx): Promise<ToolResult> {
  try {
    if (def.scope && !ctx.scopes.includes(def.scope)) {
      return fail(`this connection lacks the "${def.scope}" scope`)
    }
    return await def.handler(args, ctx)
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
}

/** Mount the registry on an McpServer (used for the legacy SSE transport). */
export function mountOnServer(server: McpServer, tools: ToolDef[], getCtx: () => ToolCtx): void {
  const reg = server.tool.bind(server) as (
    n: string,
    d: string,
    s: ZodRawShape,
    cb: (a: unknown) => Promise<ToolResult>,
  ) => unknown
  for (const def of tools) {
    reg(def.name, def.description, def.shape, (args) => runTool(def, args, getCtx()))
  }
}
