import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'

import { APPOINTMENT_STATUSES } from '../../../../db/enums'
import { appointments, leads } from '../../../../db/schema'
import type { Registrar } from '../context'
import { resolveContact } from '../lib/customer'
import { ok, ToolError } from '../lib/respond'
import { countryCodeForTimezone, normalizePhone, toIsoUtc } from '../lib/validate'
import {
  assertWithinBusinessHours,
  computeAvailability,
  findConflict,
  getBusinessOrThrow,
} from '../lib/availability'
import { formatLocalDate, formatLocalDateTime } from '../lib/time'

const slimAppt = (a: typeof appointments.$inferSelect) => {
  const tz = a.timezone ?? 'UTC'
  return {
    id: a.id,
    customer_name: a.customerName,
    customer_phone: a.customerPhone,
    service: a.service,
    starts_at: a.startsAt,
    ends_at: a.endsAt,
    // Spoken read-back in the appointment's own timezone — the agent says this verbatim
    // instead of converting the UTC `starts_at` itself.
    when: formatLocalDateTime(new Date(a.startsAt), tz),
    timezone: tz,
    status: a.status,
    location: a.location,
  }
}

/** Resolve [start,end] from starts_at + (ends_at | duration_minutes | default 30). */
function resolveWindow(startsAt: string, endsAt?: string, durationMinutes?: number) {
  const startIso = toIsoUtc(startsAt)
  const start = new Date(startIso)
  let end: Date
  if (endsAt) {
    end = new Date(toIsoUtc(endsAt))
  } else {
    end = new Date(start.getTime() + (durationMinutes ?? 30) * 60 * 1000)
  }
  if (end <= start) throw new ToolError('the appointment end must be after its start')
  return { start, end }
}

export function registerAppointmentTools(def: Registrar): void {
  def(
    'check_availability',
    'Check open appointment slots against business hours and existing bookings BEFORE promising any time. Pass either a single `date` (YYYY-MM-DD) or a `from`/`to` ISO range; defaults to the next 7 days. `duration_minutes` defaults to 30.',
    {
      date: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      duration_minutes: z.number().int().positive().optional(),
      service: z.string().optional(),
    },
    'appointments:read',
    async (a, ctx) => {
      const result = await computeAvailability(ctx.db, ctx.businessId, {
        localDate: a.date,
        from: a.from ? new Date(toIsoUtc(a.from)) : undefined,
        to: a.to ? new Date(toIsoUtc(a.to)) : undefined,
        durationMinutes: a.duration_minutes,
      })
      const tz = result.timezone
      return ok({
        timezone: tz,
        // Ground the agent in the business's local "today" so it resolves "next Monday"
        // correctly instead of guessing — and offer each slot as a ready-to-speak label.
        today: formatLocalDate(new Date(), tz),
        duration_minutes: result.durationMinutes,
        available: result.slots.length > 0,
        slots: result.slots.map((s) => ({
          ...s,
          label: formatLocalDateTime(new Date(s.starts_at), tz),
        })),
      })
    },
  )

  def(
    'book_appointment',
    'Book and confirm an appointment for the caller. ALWAYS call check_availability first and confirm the date/time back to the caller. Times are ISO-8601 (UTC, e.g. 2026-06-20T09:30:00Z). Provide ends_at OR duration_minutes (defaults to 30). Rejects past times, times outside business hours, and double-bookings.',
    {
      customer_name: z.string().min(1),
      customer_phone: z.string(),
      service: z.string().min(1),
      starts_at: z.string(),
      ends_at: z.string().optional(),
      duration_minutes: z.number().int().positive().optional(),
      customer_email: z.string().email().optional(),
      location: z.string().optional(),
      lead_id: z.string().optional(),
      call_id: z.string().optional(),
      notes: z.string().optional(),
    },
    'appointments:write',
    async (a, ctx) => {
      const biz = await getBusinessOrThrow(ctx.db, ctx.businessId)
      const phone = normalizePhone(a.customer_phone, countryCodeForTimezone(biz.timezone))
      const { start, end } = resolveWindow(a.starts_at, a.ends_at, a.duration_minutes)
      if (start.getTime() < Date.now()) throw new ToolError('that time is in the past; offer a future slot')

      await assertWithinBusinessHours(ctx.db, ctx.businessId, start, end)
      const clash = await findConflict(ctx.db, ctx.businessId, start, end)
      if (clash) throw new ToolError('that slot is already booked; offer the caller a different time')

      // Identity by phone: reuse the caller's contact or create it (store-if-not-found).
      const { contact, created } = await resolveContact(ctx.db, ctx.businessId, {
        phone,
        name: a.customer_name.trim(),
        email: a.customer_email,
        callId: a.call_id,
      })
      const leadId = a.lead_id ?? contact.id

      const [appt] = await ctx.db
        .insert(appointments)
        .values({
          businessId: ctx.businessId,
          callId: a.call_id ?? null,
          leadId,
          customerName: a.customer_name.trim(),
          customerPhone: phone,
          customerEmail: a.customer_email ?? null,
          service: a.service.trim(),
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          timezone: biz.timezone,
          status: 'confirmed',
          location: a.location ?? null,
          notes: a.notes ?? null,
        })
        .returning()

      // Reflect the booking on the contact record.
      await ctx.db.update(leads).set({ status: 'scheduled', updatedAt: new Date().toISOString() }).where(eq(leads.id, leadId))

      return ok({
        appointment: slimAppt(appt!),
        timezone: biz.timezone,
        customer: { contact_id: contact.id, new_contact: created },
      })
    },
  )

  def(
    'get_appointment',
    'Fetch a single appointment by id.',
    { appointment_id: z.string() },
    'appointments:read',
    async ({ appointment_id }, ctx) => {
      const row = await ctx.db.query.appointments.findFirst({
        where: and(eq(appointments.id, appointment_id), eq(appointments.businessId, ctx.businessId)),
      })
      if (!row) throw new ToolError('appointment not found')
      return ok({ appointment: slimAppt(row), notes: row.notes, timezone: row.timezone })
    },
  )

  def(
    'list_appointments',
    'List appointments by date range (ISO), status, and/or caller phone. Use phone to find a returning caller\'s booking. Feeds the dashboard calendar.',
    {
      from: z.string().optional(),
      to: z.string().optional(),
      status: z.enum(APPOINTMENT_STATUSES).optional(),
      phone: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    'appointments:read',
    async (a, ctx) => {
      const conds = [eq(appointments.businessId, ctx.businessId)]
      if (a.from) conds.push(gte(appointments.startsAt, toIsoUtc(a.from)))
      if (a.to) conds.push(lte(appointments.startsAt, toIsoUtc(a.to)))
      if (a.status) conds.push(eq(appointments.status, a.status))
      if (a.phone) conds.push(eq(appointments.customerPhone, normalizePhone(a.phone)))
      const rows = await ctx.db.query.appointments.findMany({
        where: and(...conds),
        orderBy: desc(appointments.startsAt),
        limit: a.limit ?? 25,
      })
      return ok({ count: rows.length, appointments: rows.map(slimAppt) })
    },
  )

  def(
    'reschedule_appointment',
    'Move an existing appointment to a new time. Re-checks business hours and double-booking. Provide new starts_at and ends_at OR duration_minutes.',
    {
      appointment_id: z.string(),
      starts_at: z.string(),
      ends_at: z.string().optional(),
      duration_minutes: z.number().int().positive().optional(),
    },
    'appointments:write',
    async (a, ctx) => {
      const existing = await ctx.db.query.appointments.findFirst({
        where: and(eq(appointments.id, a.appointment_id), eq(appointments.businessId, ctx.businessId)),
      })
      if (!existing) throw new ToolError('appointment not found')
      const { start, end } = resolveWindow(a.starts_at, a.ends_at, a.duration_minutes)
      if (start.getTime() < Date.now()) throw new ToolError('that time is in the past; offer a future slot')
      await assertWithinBusinessHours(ctx.db, ctx.businessId, start, end)
      const clash = await findConflict(ctx.db, ctx.businessId, start, end, a.appointment_id)
      if (clash) throw new ToolError('that slot is already booked; offer the caller a different time')

      const [updated] = await ctx.db
        .update(appointments)
        .set({ startsAt: start.toISOString(), endsAt: end.toISOString(), updatedAt: new Date().toISOString() })
        .where(and(eq(appointments.id, a.appointment_id), eq(appointments.businessId, ctx.businessId)))
        .returning()
      return ok({ appointment: slimAppt(updated!) })
    },
  )

  def(
    'cancel_appointment',
    'Cancel an appointment (soft — sets status to cancelled and keeps the record for history). Optionally record a reason.',
    { appointment_id: z.string(), reason: z.string().optional() },
    'appointments:write',
    async (a, ctx) => {
      const existing = await ctx.db.query.appointments.findFirst({
        where: and(eq(appointments.id, a.appointment_id), eq(appointments.businessId, ctx.businessId)),
      })
      if (!existing) throw new ToolError('appointment not found')
      const note = a.reason ? `${existing.notes ? existing.notes + '\n' : ''}Cancelled: ${a.reason}` : existing.notes
      const [updated] = await ctx.db
        .update(appointments)
        .set({ status: 'cancelled', notes: note, updatedAt: new Date().toISOString() })
        .where(and(eq(appointments.id, a.appointment_id), eq(appointments.businessId, ctx.businessId)))
        .returning()
      return ok({ appointment: slimAppt(updated!) })
    },
  )
}
