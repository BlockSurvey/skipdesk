import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { CALL_OUTCOMES, SENTIMENTS } from '../../../../db/enums'
import { appointments, calls, leads } from '../../../../db/schema'
import type { Registrar } from '../context'
import { ok, ToolError } from '../lib/respond'
import { normalizePhone, toIsoUtc } from '../lib/validate'

const slimCall = (c: typeof calls.$inferSelect) => ({
  id: c.id,
  caller_number: c.callerNumber,
  outcome: c.outcome,
  intent: c.intent,
  sentiment: c.sentiment,
  duration_seconds: c.durationSeconds,
  started_at: c.startedAt,
  summary: c.summary,
})

export function registerCallTools(def: Registrar): void {
  def(
    'log_call',
    'Record the outcome of this call when it ends: caller number, outcome, AI summary, intent, sentiment, duration, and transcript. Idempotent on provider_call_id (call again to update the same call). Pass lead_id / appointment_id to link this call to what it produced.',
    {
      provider_call_id: z.string().optional(),
      caller_number: z.string().optional(),
      started_at: z.string().optional(),
      ended_at: z.string().optional(),
      duration_seconds: z.number().int().nonnegative().optional(),
      outcome: z.enum(CALL_OUTCOMES),
      summary: z.string().optional(),
      intent: z.string().optional(),
      sentiment: z.enum(SENTIMENTS).optional(),
      transcript: z.string().optional(),
      recording_url: z.string().url().optional(),
      lead_id: z.string().optional(),
      appointment_id: z.string().optional(),
    },
    'calls:write',
    async (a, ctx) => {
      const values = {
        callerNumber: a.caller_number ? normalizePhone(a.caller_number) : null,
        startedAt: a.started_at ? toIsoUtc(a.started_at) : null,
        endedAt: a.ended_at ? toIsoUtc(a.ended_at) : null,
        durationSeconds: a.duration_seconds ?? null,
        outcome: a.outcome,
        summary: a.summary ?? null,
        intent: a.intent ?? null,
        sentiment: a.sentiment ?? null,
        transcript: a.transcript ?? null,
        recordingUrl: a.recording_url ?? null,
        updatedAt: new Date().toISOString(),
      }

      // Upsert on provider_call_id within the tenant.
      let row: typeof calls.$inferSelect | undefined
      if (a.provider_call_id) {
        const existing = await ctx.db.query.calls.findFirst({
          where: and(eq(calls.businessId, ctx.businessId), eq(calls.providerCallId, a.provider_call_id)),
        })
        if (existing) {
          ;[row] = await ctx.db.update(calls).set(values).where(eq(calls.id, existing.id)).returning()
        }
      }
      if (!row) {
        ;[row] = await ctx.db
          .insert(calls)
          .values({ businessId: ctx.businessId, providerCallId: a.provider_call_id ?? null, direction: 'inbound', ...values })
          .returning()
      }
      if (!row) throw new ToolError('failed to log call')

      // Backlink the produced lead/appointment to this call.
      if (a.lead_id) {
        await ctx.db
          .update(leads)
          .set({ callId: row.id })
          .where(and(eq(leads.id, a.lead_id), eq(leads.businessId, ctx.businessId)))
      }
      if (a.appointment_id) {
        await ctx.db
          .update(appointments)
          .set({ callId: row.id })
          .where(and(eq(appointments.id, a.appointment_id), eq(appointments.businessId, ctx.businessId)))
      }

      return ok({ call: slimCall(row) })
    },
  )

  def(
    'list_calls',
    'List recent calls for staff review, optionally filtered by outcome. Most recent first.',
    {
      outcome: z.enum(CALL_OUTCOMES).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    'calls:read',
    async (a, ctx) => {
      const conds = [eq(calls.businessId, ctx.businessId)]
      if (a.outcome) conds.push(eq(calls.outcome, a.outcome))
      const rows = await ctx.db.query.calls.findMany({
        where: and(...conds),
        orderBy: desc(calls.createdAt),
        limit: a.limit ?? 25,
      })
      return ok({ count: rows.length, calls: rows.map(slimCall) })
    },
  )
}
