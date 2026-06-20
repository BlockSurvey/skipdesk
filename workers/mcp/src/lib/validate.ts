/**
 * Input cleaners — every value an MCP tool writes to a table passes through here,
 * so the DB only ever sees normalized data (the user's "clean data" requirement).
 */
import { ToolError } from './respond'

/**
 * Map a business IANA timezone to a default country calling code, used to
 * complete local numbers that callers give without a country code.
 */
export function countryCodeForTimezone(tz: string | undefined | null): string | null {
  if (!tz) return null
  const map: Record<string, string> = {
    'Asia/Kolkata': '91',
    'Asia/Calcutta': '91',
    'Asia/Dubai': '971',
    'Asia/Singapore': '65',
    'Europe/London': '44',
    'Australia/Sydney': '61',
  }
  if (map[tz]) return map[tz]
  if (tz.startsWith('America/')) return '1'
  return null
}

/**
 * Normalize a spoken/typed phone to E.164 (`+` + 7–15 digits). STT mangles
 * digits, so callers say "+91 98-7654..." etc. If the caller gave a bare local
 * number (no `+`) and we know the business's country code, we prepend it — so a
 * 10-digit Indian number becomes +91…, not a malformed +93… .
 */
export function normalizePhone(raw: string, defaultCountryCode?: string | null): string {
  const trimmed = raw.trim()
  const digits = trimmed.replace(/[^\d]/g, '')
  let e164: string
  if (trimmed.startsWith('+')) {
    e164 = `+${digits}`
  } else if (defaultCountryCode && digits.length <= 10) {
    e164 = `+${defaultCountryCode}${digits}`
  } else {
    e164 = `+${digits}`
  }
  const out = e164.slice(1)
  if (out.length < 7 || out.length > 15) {
    throw new ToolError(`"${raw}" is not a valid phone number (need 7–15 digits)`)
  }
  return e164
}

/** Parse any reasonable date/time string and store it as ISO-8601 UTC. */
export function toIsoUtc(raw: string): string {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    throw new ToolError(`"${raw}" is not a valid date/time (use ISO-8601, e.g. 2026-06-20T14:30:00Z)`)
  }
  return d.toISOString()
}

/** Validate a value against an allowed set (mirrors the DB CHECK constraints). */
export function oneOf<T extends string>(
  raw: string,
  allowed: readonly T[],
  field: string,
): T {
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new ToolError(`${field} must be one of: ${allowed.join(', ')} (got "${raw}")`)
  }
  return raw as T
}

/** Trim + reject empty required strings. */
export function required(raw: string | undefined, field: string): string {
  const v = (raw ?? '').trim()
  if (!v) throw new ToolError(`${field} is required`)
  return v
}
