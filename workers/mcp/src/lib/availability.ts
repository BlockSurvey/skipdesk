/**
 * Availability = the business's open hours, minus already-booked appointments.
 * Computed entirely from our own D1 tables (no external calendar). Returns
 * bookable slots as ISO-8601 UTC ranges the agent can offer the caller.
 */
import { and, eq, gte, lte, ne } from 'drizzle-orm'

import type { Db } from '../../../../db/client'
import { appointments, businessHours, businesses } from '../../../../db/schema'
import { ToolError } from './respond'
import { localParts, parseHhMm, zonedWallClockToUtc } from './time'

export type Slot = { starts_at: string; ends_at: string }

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_RANGE_DAYS = 30
const MAX_SLOTS = 24

export async function getBusinessOrThrow(db: Db, businessId: string) {
  const biz = await db.query.businesses.findFirst({ where: eq(businesses.id, businessId) })
  if (!biz) throw new ToolError('business not found')
  return biz
}

/**
 * One open/close window for a given local day, as UTC instants (null if closed).
 */
function hoursForDay(
  hours: { dayOfWeek: number; openTime: string | null; closeTime: string | null; closed: boolean }[],
  timeZone: string,
  localDay: { year: number; month: number; day: number; dow: number },
): { openUtc: Date; closeUtc: Date } | null {
  const row = hours.find((h) => h.dayOfWeek === localDay.dow)
  if (!row || row.closed || !row.openTime || !row.closeTime) return null
  const open = parseHhMm(row.openTime)
  const close = parseHhMm(row.closeTime)
  const openUtc = zonedWallClockToUtc(localDay.year, localDay.month, localDay.day, Math.floor(open / 60), open % 60, timeZone)
  const closeUtc = zonedWallClockToUtc(localDay.year, localDay.month, localDay.day, Math.floor(close / 60), close % 60, timeZone)
  return { openUtc, closeUtc }
}

export async function computeAvailability(
  db: Db,
  businessId: string,
  opts: { from?: Date; to?: Date; localDate?: string; durationMinutes?: number; now?: Date },
): Promise<{ timezone: string; durationMinutes: number; slots: Slot[] }> {
  const biz = await getBusinessOrThrow(db, businessId)
  const tz = biz.timezone
  const now = opts.now ?? new Date()
  const durationMinutes = opts.durationMinutes ?? 30
  if (durationMinutes <= 0 || durationMinutes > 24 * 60) {
    throw new ToolError('duration_minutes must be between 1 and 1440')
  }

  // Resolve the search window.
  let from: Date
  let to: Date
  if (opts.localDate) {
    const [y, m, d] = opts.localDate.split('-').map(Number)
    if (!y || !m || !d) throw new ToolError(`date must be YYYY-MM-DD (got "${opts.localDate}")`)
    from = zonedWallClockToUtc(y, m, d, 0, 0, tz)
    to = zonedWallClockToUtc(y, m, d, 23, 59, tz)
  } else {
    from = opts.from ?? now
    to = opts.to ?? new Date(now.getTime() + 7 * DAY_MS)
  }
  if (to <= from) throw new ToolError('the end of the availability window must be after the start')
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw new ToolError(`availability window cannot exceed ${MAX_RANGE_DAYS} days`)
  }

  const hours = await db.query.businessHours.findMany({ where: eq(businessHours.businessId, businessId) })

  // Existing appointments that consume time (anything not cancelled).
  const booked = await db.query.appointments.findMany({
    where: and(
      eq(appointments.businessId, businessId),
      ne(appointments.status, 'cancelled'),
      gte(appointments.endsAt, from.toISOString()),
      lte(appointments.startsAt, to.toISOString()),
    ),
  })
  const busy = booked.map((a) => ({ start: new Date(a.startsAt).getTime(), end: new Date(a.endsAt).getTime() }))

  const slots: Slot[] = []
  const stepMs = durationMinutes * 60 * 1000

  // Walk each local calendar day in the window.
  for (let cursor = from.getTime(); cursor <= to.getTime() && slots.length < MAX_SLOTS; cursor += DAY_MS) {
    const lp = localParts(new Date(cursor), tz)
    const window = hoursForDay(hours, tz, lp)
    if (!window) continue

    for (
      let s = window.openUtc.getTime();
      s + stepMs <= window.closeUtc.getTime() && slots.length < MAX_SLOTS;
      s += stepMs
    ) {
      const e = s + stepMs
      if (s < from.getTime() || e > to.getTime()) continue
      if (s < now.getTime()) continue // no past slots
      const clash = busy.some((b) => s < b.end && e > b.start)
      if (clash) continue
      slots.push({ starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString() })
    }
  }

  return { timezone: tz, durationMinutes, slots }
}

/** Is [start,end] inside the business's open hours for that local day? */
export async function assertWithinBusinessHours(
  db: Db,
  businessId: string,
  start: Date,
  end: Date,
): Promise<void> {
  const biz = await getBusinessOrThrow(db, businessId)
  const hours = await db.query.businessHours.findMany({ where: eq(businessHours.businessId, businessId) })
  const lp = localParts(start, biz.timezone)
  const window = hoursForDay(hours, biz.timezone, lp)
  if (!window) {
    throw new ToolError(`the business is closed on that day; pick another time`)
  }
  if (start < window.openUtc || end > window.closeUtc) {
    throw new ToolError('that time is outside business hours; offer the caller a slot within opening hours')
  }
}

/** Any non-cancelled appointment overlapping [start,end], optionally excluding one id. */
export async function findConflict(
  db: Db,
  businessId: string,
  start: Date,
  end: Date,
  excludeId?: string,
) {
  const sameWindow = await db.query.appointments.findMany({
    where: and(
      eq(appointments.businessId, businessId),
      ne(appointments.status, 'cancelled'),
      gte(appointments.endsAt, start.toISOString()),
      lte(appointments.startsAt, end.toISOString()),
    ),
  })
  return sameWindow.find(
    (a) =>
      a.id !== excludeId &&
      start < new Date(a.endsAt) &&
      end > new Date(a.startsAt),
  )
}
