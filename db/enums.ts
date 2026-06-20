/**
 * Single source of truth for every enumerated column.
 *
 * SQLite/D1 has no native ENUM type, so these are stored as TEXT and guarded by
 * `CHECK (col IN (...))` constraints in the schema. The same arrays are reused
 * to build those CHECK constraints (see `oneOf()` in schema.ts) and to derive
 * the TypeScript union types below — so the DB, the ORM types, and any
 * app-level validation can never drift apart.
 */

export const BUSINESS_STATUSES = ['active', 'suspended'] as const
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number]

export const CALL_DIRECTIONS = ['inbound', 'outbound'] as const
export type CallDirection = (typeof CALL_DIRECTIONS)[number]

export const CALL_OUTCOMES = [
  'info_provided',
  'appointment_booked',
  'lead_captured',
  'escalated',
  'transferred',
  'abandoned',
] as const
export type CallOutcome = (typeof CALL_OUTCOMES)[number]

export const SENTIMENTS = ['positive', 'neutral', 'negative'] as const
export type Sentiment = (typeof SENTIMENTS)[number]

export const LEAD_URGENCIES = ['low', 'normal', 'high'] as const
export type LeadUrgency = (typeof LEAD_URGENCIES)[number]

export const LEAD_STATUSES = ['new', 'contacted', 'scheduled', 'closed'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const APPOINTMENT_STATUSES = [
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

// 'owner' = the account that signed up and owns the business (single-owner model).
export const USER_ROLES = ['owner', 'admin', 'agent', 'viewer'] as const
export type UserRole = (typeof USER_ROLES)[number]

/** API-key scopes. Machine callers (voice platform, MCP) get a subset of these. */
export const API_SCOPES = [
  'leads:read',
  'leads:write',
  'appointments:read',
  'appointments:write',
  'calls:read',
  'calls:write',
  'info:read',
] as const
export type ApiScope = (typeof API_SCOPES)[number]
