/**
 * Timezone helpers. Business hours are stored as local wall-clock `HH:MM` in the
 * business's IANA timezone, but appointments are stored as ISO-8601 UTC. To check
 * "is this slot within opening hours?" we convert between the two using Intl
 * (available on Workers). DST transition edges are approximated (good enough for
 * appointment booking; documented here so it isn't mistaken for exact).
 */

/** Milliseconds that `timeZone` is ahead of UTC at the given instant. */
export function tzOffsetMs(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p: Record<string, number> = {}
  for (const part of dtf.formatToParts(at)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value)
  }
  const asIfUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!)
  return asIfUtc - at.getTime()
}

/** Build the UTC instant for a wall-clock time in `timeZone`. */
export function zonedWallClockToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const offset = tzOffsetMs(new Date(guess), timeZone)
  return new Date(guess - offset)
}

/** Local calendar parts of a UTC instant, as seen in `timeZone`. */
export function localParts(at: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const p: Record<string, number> = {}
  for (const part of dtf.formatToParts(at)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value)
  }
  // day-of-week 0=Sun..6=Sat, matching the business_hours.day_of_week convention.
  const dow = new Date(Date.UTC(p.year!, p.month! - 1, p.day!)).getUTCDay()
  return { year: p.year!, month: p.month!, day: p.day!, hour: p.hour!, minute: p.minute!, dow }
}

/** Parse 'HH:MM' → minutes since midnight. */
export function parseHhMm(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/**
 * Spoken-date formatting. The voice agent must NEVER compute weekdays or convert
 * timezones itself (LLMs drift — e.g. calling the 24th "Monday" when the 22nd is).
 * So we render every date the agent reads aloud here, in the business's IANA tz,
 * and the agent just speaks the string. This is the heart of the tz boundary:
 * the business timezone is the single authoritative clock.
 */
const localFmt = (tz: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts })

/** "Monday, June 22, 2026" — weekday included so the agent never guesses it. */
export function formatLocalDate(at: Date, tz: string): string {
  return localFmt(tz, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(at)
}

/** "9:00 AM" in the business's local time. */
export function formatLocalTime(at: Date, tz: string): string {
  return localFmt(tz, { hour: 'numeric', minute: '2-digit', hour12: true }).format(at)
}

/** "Monday, June 22, 2026 at 9:00 AM" — the canonical read-back for a slot/booking. */
export function formatLocalDateTime(at: Date, tz: string): string {
  return `${formatLocalDate(at, tz)} at ${formatLocalTime(at, tz)}`
}
