/** Helpers to format MCP tool results consistently. */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export type ToolResult = CallToolResult

/** Success — serialize structured data the agent can read back to the caller. */
export const ok = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
})

/** Failure — a clean, caller-safe message. The agent should apologize + adapt. */
export const fail = (message: string): ToolResult => ({
  content: [{ type: 'text', text: `error: ${message}` }],
  isError: true,
})

/** Thrown by validators; converted to a `fail()` result by the tool wrapper. */
export class ToolError extends Error {}
