import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'

import { LEAD_STATUSES, LEAD_URGENCIES } from '../../../../db/enums'
import { appointments, escalationContacts, leads } from '../../../../db/schema'
import type { Registrar } from '../context'
import { businessCountryCode, resolveContact } from '../lib/customer'
import { ok, ToolError } from '../lib/respond'
import { normalizePhone, toIsoUtc } from '../lib/validate'

const slimLead = (l: typeof leads.$inferSelect) => ({
  id: l.id,
  full_name: l.fullName,
  phone: l.phone,
  email: l.email,
  reason: l.reason,
  preferred_time: l.preferredTime,
  urgency: l.urgency,
  status: l.status,
  escalated: l.escalated,
  created_at: l.createdAt,
})

export function registerLeadTools(def: Registrar): void {
  // ── existing-customer entry point ──────────────────────────────────────────
  def(
    'lookup_caller',
    'At the START of a call, look up whether a phone number belongs to a known caller — returns their prior leads and any appointments so you can greet them by name and avoid re-asking. Returns found=false for a brand-new caller.',
    { phone: z.string() },
    'leads:read',
    async ({ phone }, ctx) => {
      const e164 = normalizePhone(phone, await businessCountryCode(ctx.db, ctx.businessId))
      const priorLeads = await ctx.db.query.leads.findMany({
        where: and(eq(leads.businessId, ctx.businessId), eq(leads.phone, e164)),
        orderBy: desc(leads.createdAt),
        limit: 5,
      })
      const appts = await ctx.db.query.appointments.findMany({
        where: and(eq(appointments.businessId, ctx.businessId), eq(appointments.customerPhone, e164)),
        orderBy: desc(appointments.startsAt),
        limit: 5,
      })
      return ok({
        phone: e164,
        found: priorLeads.length > 0 || appts.length > 0,
        name: priorLeads[0]?.fullName ?? appts[0]?.customerName ?? null,
        leads: priorLeads.map(slimLead),
        appointments: appts.map((a) => ({
          id: a.id,
          service: a.service,
          starts_at: a.startsAt,
          status: a.status,
        })),
      })
    },
  )

  // ── capture intent (new or returning) ──────────────────────────────────────
  def(
    'create_lead',
    "Capture a caller's request as a lead when you can't fully serve them on the call (no availability, needs staff, complex question). Always confirm the phone number by reading it back first. Set escalate=true to flag for higher-priority staff follow-up.",
    {
      full_name: z.string().min(1),
      phone: z.string(),
      reason: z.string().min(1),
      email: z.string().email().optional(),
      preferred_time: z.string().optional(),
      urgency: z.enum(LEAD_URGENCIES).optional(),
      escalate: z.boolean().optional(),
      call_id: z.string().optional(),
    },
    'leads:write',
    async (a, ctx) => {
      const phone = normalizePhone(a.phone, await businessCountryCode(ctx.db, ctx.businessId))
      // Identity is the phone: reuse the existing contact, or create one. No duplicates.
      const { contact, created } = await resolveContact(ctx.db, ctx.businessId, {
        phone,
        name: a.full_name.trim(),
        email: a.email,
        callId: a.call_id,
      })
      // Record/refresh this call's intent on the (existing or new) contact.
      const [updated] = await ctx.db
        .update(leads)
        .set({
          fullName: a.full_name.trim() || contact.fullName,
          email: a.email ?? contact.email,
          reason: a.reason.trim(),
          preferredTime: a.preferred_time ?? contact.preferredTime,
          urgency: a.urgency ?? contact.urgency,
          escalated: a.escalate ?? contact.escalated,
          // a fresh intent on a closed contact re-opens it
          status: contact.status === 'closed' ? 'new' : contact.status,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(leads.id, contact.id))
        .returning()

      let escalateTo = null
      if (a.escalate) {
        const top = await ctx.db.query.escalationContacts.findFirst({
          where: eq(escalationContacts.businessId, ctx.businessId),
          orderBy: (c, { asc }) => asc(c.priority),
        })
        escalateTo = top ? { name: top.name, role: top.role } : null
      }
      return ok({ lead: slimLead(updated!), created, reused: !created, escalated_to: escalateTo })
    },
  )

  def(
    'get_lead',
    'Fetch a single lead by id.',
    { lead_id: z.string() },
    'leads:read',
    async ({ lead_id }, ctx) => {
      const row = await ctx.db.query.leads.findFirst({
        where: and(eq(leads.id, lead_id), eq(leads.businessId, ctx.businessId)),
      })
      if (!row) throw new ToolError('lead not found')
      return ok({ lead: slimLead(row), notes: row.notes, assigned_to: row.assignedTo })
    },
  )

  def(
    'list_leads',
    'List/search leads for staff review, filtered by status, urgency, and/or created date range (ISO-8601). Most recent first.',
    {
      status: z.enum(LEAD_STATUSES).optional(),
      urgency: z.enum(LEAD_URGENCIES).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    'leads:read',
    async (a, ctx) => {
      const conds = [eq(leads.businessId, ctx.businessId)]
      if (a.status) conds.push(eq(leads.status, a.status))
      if (a.urgency) conds.push(eq(leads.urgency, a.urgency))
      if (a.from) conds.push(gte(leads.createdAt, toIsoUtc(a.from)))
      if (a.to) conds.push(lte(leads.createdAt, toIsoUtc(a.to)))
      const rows = await ctx.db.query.leads.findMany({
        where: and(...conds),
        orderBy: desc(leads.createdAt),
        limit: a.limit ?? 25,
      })
      return ok({ count: rows.length, leads: rows.map(slimLead) })
    },
  )

  def(
    'update_lead',
    "Update a lead's status, urgency, assignment, escalation flag, or notes (e.g. mark it 'contacted' after follow-up).",
    {
      lead_id: z.string(),
      status: z.enum(LEAD_STATUSES).optional(),
      urgency: z.enum(LEAD_URGENCIES).optional(),
      assigned_to: z.string().optional(),
      escalated: z.boolean().optional(),
      notes: z.string().optional(),
    },
    'leads:write',
    async (a, ctx) => {
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
      if (a.status !== undefined) patch.status = a.status
      if (a.urgency !== undefined) patch.urgency = a.urgency
      if (a.assigned_to !== undefined) patch.assignedTo = a.assigned_to
      if (a.escalated !== undefined) patch.escalated = a.escalated
      if (a.notes !== undefined) patch.notes = a.notes
      const [updated] = await ctx.db
        .update(leads)
        .set(patch)
        .where(and(eq(leads.id, a.lead_id), eq(leads.businessId, ctx.businessId)))
        .returning()
      if (!updated) throw new ToolError('lead not found')
      return ok({ lead: slimLead(updated), notes: updated.notes })
    },
  )
}
