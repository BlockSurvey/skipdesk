/**
 * Skip Desk — canonical database schema (Drizzle, sqlite-core → Cloudflare D1).
 *
 * Design rules that make this fast AND portable (see docs spec §3–§4):
 *  - Every operational table carries `business_id`; tenant isolation is enforced
 *    in the data layer by filtering on it unconditionally. Accordingly, every
 *    composite index LEADS with `business_id` so the tenant filter and the
 *    list/sort predicate are satisfied by one index walk.
 *  - IDs are app-generated UUIDv4 TEXT (no autoincrement) — portable + collision-safe
 *    across distributed Workers.
 *  - Timestamps are ISO-8601 UTC stored as TEXT. Booleans are INTEGER 0/1
 *    (Drizzle `mode: 'boolean'`). Enums are TEXT + CHECK. JSON is TEXT (`mode: 'json'`).
 */

import { relations, sql, type SQL } from 'drizzle-orm'
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

import {
  API_SCOPES,
  APPOINTMENT_STATUSES,
  BUSINESS_STATUSES,
  CALL_DIRECTIONS,
  CALL_OUTCOMES,
  DOCUMENT_STATUSES,
  LEAD_STATUSES,
  LEAD_URGENCIES,
  SENTIMENTS,
  USER_ROLES,
  type ApiScope,
} from './enums'

// ── shared column helpers ────────────────────────────────────────────────────

/** TEXT primary key, defaulted to an app-generated UUIDv4 (works in Workers + Node). */
const pk = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID())

/** ISO-8601 UTC string, defaulted to "now" on insert. */
const createdAt = () =>
  text('created_at').notNull().$defaultFn(() => new Date().toISOString())

/** ISO-8601 UTC string, defaulted on insert; bump in the data layer on update. */
const updatedAt = () =>
  text('updated_at').notNull().$defaultFn(() => new Date().toISOString())

/**
 * Build a `CHECK (col IN ('a','b',...))` from an enum array, so the DB constraint
 * and the TS union (in enums.ts) share one source. Values are trusted constants.
 */
const oneOf = (col: AnySQLiteColumn, values: readonly string[]): SQL =>
  sql`${col} in ${sql.raw(`(${values.map((v) => `'${v}'`).join(', ')})`)}`

// ── 4.1 businesses — tenant root ─────────────────────────────────────────────

export const businesses = sqliteTable(
  'businesses',
  {
    id: pk(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** IANA tz (e.g. Asia/Kolkata) — drives availability + appointment display. */
    timezone: text('timezone').notNull(),
    locale: text('locale').notNull().default('en'),
    status: text('status').notNull().default('active'),
    // ── profile + agent preferences (captured in onboarding, edited in settings) ──
    industry: text('industry'),
    phone: text('phone'),
    address: text('address'),
    /** Display name the voice agent uses for itself, e.g. "Sam". */
    agentName: text('agent_name'),
    /** Custom first-message / greeting for the voice agent. */
    greeting: text('greeting'),
    /** Default appointment length (minutes) when a tool doesn't specify one. */
    defaultAppointmentMinutes: integer('default_appointment_minutes').notNull().default(30),
    createdAt: createdAt(),
  },
  (t) => ({
    slugUq: uniqueIndex('uq_businesses_slug').on(t.slug),
    statusCk: check('ck_businesses_status', oneOf(t.status, BUSINESS_STATUSES)),
  }),
)

// ── 4.10 users — dashboard logins ────────────────────────────────────────────

export const users = sqliteTable(
  'users',
  {
    id: pk(),
    // Nullable: a user signs up first, then creates their business during onboarding.
    businessId: text('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    role: text('role').notNull().default('owner'),
    passwordHash: text('password_hash'),
    createdAt: createdAt(),
  },
  (t) => ({
    // Email is GLOBALLY unique — login is by email + password without a business context.
    emailUq: uniqueIndex('uq_users_email').on(t.email),
    roleCk: check('ck_users_role', oneOf(t.role, USER_ROLES)),
  }),
)

// ── 4.11 sessions — dashboard auth (httpOnly cookie ⇄ hashed token in D1) ─────

export const sessions = sqliteTable(
  'sessions',
  {
    id: pk(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 hex of the opaque session token; the raw token lives only in the cookie. */
    tokenHash: text('token_hash').notNull(),
    createdAt: createdAt(),
    expiresAt: text('expires_at').notNull(),
    lastSeenAt: text('last_seen_at'),
  },
  (t) => ({
    tokenHashUq: uniqueIndex('uq_sessions_token_hash').on(t.tokenHash),
    userIdx: index('idx_sessions_user').on(t.userId),
  }),
)

// ── 4.2 business_hours — "are we open now?" ──────────────────────────────────

export const businessHours = sqliteTable(
  'business_hours',
  {
    id: pk(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(), // 0=Sun … 6=Sat
    openTime: text('open_time'), // 'HH:MM'
    closeTime: text('close_time'), // 'HH:MM'
    closed: integer('closed', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => ({
    businessDayIdx: index('idx_business_hours_business_day').on(t.businessId, t.dayOfWeek),
    dowCk: check('ck_business_hours_dow', sql`${t.dayOfWeek} between 0 and 6`),
  }),
)

// ── 4.3 business_faqs — info the agent reads out ─────────────────────────────

export const businessFaqs = sqliteTable(
  'business_faqs',
  {
    id: pk(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    tags: text('tags'), // comma/JSON tags for lookup
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    // get_business_info filters to a tenant's active FAQs, then LIKE-matches text.
    businessActiveIdx: index('idx_business_faqs_business_active').on(t.businessId, t.isActive),
  }),
)

// ── 4.4 escalation_contacts — the "higher officials" ─────────────────────────

export const escalationContacts = sqliteTable(
  'escalation_contacts',
  {
    id: pk(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role'),
    phone: text('phone'),
    email: text('email'),
    priority: integer('priority').notNull().default(0), // lower = contacted first
    createdAt: createdAt(),
  },
  (t) => ({
    businessPriorityIdx: index('idx_escalation_contacts_business_priority').on(t.businessId, t.priority),
  }),
)

// ── 4.5 phone_numbers — inbound number → business routing ────────────────────

export const phoneNumbers = sqliteTable(
  'phone_numbers',
  {
    id: pk(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    e164: text('e164').notNull(), // '+1...' / '+91...'
    provider: text('provider'), // vapi / retell / twilio / plivo
    label: text('label'),
    assistantId: text('assistant_id'), // provider assistant id
    createdAt: createdAt(),
  },
  (t) => ({
    // Hot path: every inbound call resolves tenant by the dialed number. Must be unique + indexed.
    e164Uq: uniqueIndex('uq_phone_numbers_e164').on(t.e164),
    businessIdx: index('idx_phone_numbers_business').on(t.businessId),
  }),
)

// ── 4.9 api_keys — per-business machine access ───────────────────────────────

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: pk(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name'),
    keyHash: text('key_hash').notNull(), // hashed at rest; raw key shown once
    scopes: text('scopes', { mode: 'json' }).$type<ApiScope[]>().notNull().default([]),
    lastUsedAt: text('last_used_at'),
    revokedAt: text('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => ({
    // Hot path: every machine request authenticates by hashed key. Unique + indexed.
    keyHashUq: uniqueIndex('uq_api_keys_key_hash').on(t.keyHash),
    businessIdx: index('idx_api_keys_business').on(t.businessId),
  }),
)

// ── 4.6 calls — one row per call ─────────────────────────────────────────────

export const calls = sqliteTable(
  'calls',
  {
    id: pk(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    phoneNumberId: text('phone_number_id').references(() => phoneNumbers.id, {
      onDelete: 'set null',
    }),
    providerCallId: text('provider_call_id'), // id from Vapi/Retell
    callerNumber: text('caller_number'),
    direction: text('direction').notNull().default('inbound'),
    startedAt: text('started_at'),
    endedAt: text('ended_at'),
    durationSeconds: integer('duration_seconds'),
    outcome: text('outcome'),
    recordingUrl: text('recording_url'), // consent-gated, nullable
    transcript: text('transcript'),
    summary: text('summary'), // AI summary for dashboard
    intent: text('intent'),
    sentiment: text('sentiment'),
    rawPayload: text('raw_payload', { mode: 'json' }), // full provider webhook for audit
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    // Pane 1: reverse-chron calls list, optionally filtered by date range.
    businessStartedIdx: index('idx_calls_business_started').on(t.businessId, t.startedAt),
    // Filter by outcome badge within a tenant.
    businessOutcomeIdx: index('idx_calls_business_outcome').on(t.businessId, t.outcome),
    // Webhook correlation: match an incoming provider event to its call row.
    providerCallIdx: index('idx_calls_provider_call').on(t.providerCallId),
    directionCk: check('ck_calls_direction', oneOf(t.direction, CALL_DIRECTIONS)),
    outcomeCk: check('ck_calls_outcome', sql`${t.outcome} is null or ${oneOf(t.outcome, CALL_OUTCOMES)}`),
    sentimentCk: check('ck_calls_sentiment', sql`${t.sentiment} is null or ${oneOf(t.sentiment, SENTIMENTS)}`),
  }),
)

// ── 4.7 leads — captured intent / escalations ────────────────────────────────

export const leads = sqliteTable(
  'leads',
  {
    id: pk(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    callId: text('call_id').references(() => calls.id, { onDelete: 'set null' }),
    fullName: text('full_name').notNull(), // required for callback
    phone: text('phone').notNull(), // confirmed on call
    email: text('email'),
    reason: text('reason'), // intent in caller's words
    preferredTime: text('preferred_time'),
    urgency: text('urgency').notNull().default('normal'),
    status: text('status').notNull().default('new'),
    escalated: integer('escalated', { mode: 'boolean' }).notNull().default(false),
    assignedTo: text('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    // list_leads filters by status / urgency / date range within a tenant.
    businessStatusIdx: index('idx_leads_business_status').on(t.businessId, t.status),
    businessUrgencyIdx: index('idx_leads_business_urgency').on(t.businessId, t.urgency),
    businessCreatedIdx: index('idx_leads_business_created').on(t.businessId, t.createdAt),
    assignedToIdx: index('idx_leads_assigned_to').on(t.assignedTo),
    callIdx: index('idx_leads_call').on(t.callId),
    urgencyCk: check('ck_leads_urgency', oneOf(t.urgency, LEAD_URGENCIES)),
    statusCk: check('ck_leads_status', oneOf(t.status, LEAD_STATUSES)),
  }),
)

// ── 4.8 appointments — bookings ──────────────────────────────────────────────

export const appointments = sqliteTable(
  'appointments',
  {
    id: pk(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    callId: text('call_id').references(() => calls.id, { onDelete: 'set null' }),
    leadId: text('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    customerEmail: text('customer_email'),
    service: text('service').notNull(),
    startsAt: text('starts_at').notNull(), // ISO UTC
    endsAt: text('ends_at').notNull(), // ISO UTC
    timezone: text('timezone'), // display tz
    status: text('status').notNull().default('pending'),
    location: text('location'),
    calendarEventId: text('calendar_event_id'), // reserved for Google Calendar sync
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    // Panes 2 & 3: list + calendar query by start time within a date range.
    businessStartsIdx: index('idx_appointments_business_starts').on(t.businessId, t.startsAt),
    // Filter by status; also serves availability checks (exclude cancelled).
    businessStatusIdx: index('idx_appointments_business_status').on(t.businessId, t.status),
    callIdx: index('idx_appointments_call').on(t.callId),
    leadIdx: index('idx_appointments_lead').on(t.leadId),
    statusCk: check('ck_appointments_status', oneOf(t.status, APPOINTMENT_STATUSES)),
  }),
)

// ── 4.12 documents — uploaded knowledge-base files (one row per file) ─────────

export const documents = sqliteTable(
  'documents',
  {
    id: pk(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(), // original upload name
    title: text('title'), // optional display title (defaults to filename in UI)
    contentType: text('content_type').notNull(), // upload MIME
    sizeBytes: integer('size_bytes').notNull(),
    r2Key: text('r2_key').notNull(), // documents/{business_id}/{id}/{filename}
    status: text('status').notNull().default('processing'),
    error: text('error'), // failure reason when status='failed'
    chunkCount: integer('chunk_count').notNull().default(0),
    uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    // Knowledge page: reverse-chron list of a tenant's documents.
    businessCreatedIdx: index('idx_documents_business_created').on(t.businessId, t.createdAt),
    // Poll/filter by processing status within a tenant.
    businessStatusIdx: index('idx_documents_business_status').on(t.businessId, t.status),
    statusCk: check('ck_documents_status', oneOf(t.status, DOCUMENT_STATUSES)),
  }),
)

// ── 4.13 kb_chunks — one row per chunk + its embedding (vectors live in D1) ───

export const kbChunks = sqliteTable(
  'kb_chunks',
  {
    id: pk(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(), // order within the document
    text: text('text').notNull(), // chunk content (returned to the agent)
    /** Normalized embedding vector (bge-base, 768 dims) stored as JSON. */
    embedding: text('embedding', { mode: 'json' }).$type<number[]>().notNull(),
    charCount: integer('char_count'),
    createdAt: createdAt(),
  },
  (t) => ({
    // search_knowledge_base scans all of a tenant's chunks → leading business_id.
    businessIdx: index('idx_kb_chunks_business').on(t.businessId),
    // Per-document delete / count.
    documentIdx: index('idx_kb_chunks_document').on(t.documentId),
  }),
)

// ── relations (for Drizzle relational queries: joins for dashboard panes) ─────

export const businessesRelations = relations(businesses, ({ many }) => ({
  users: many(users),
  hours: many(businessHours),
  faqs: many(businessFaqs),
  escalationContacts: many(escalationContacts),
  phoneNumbers: many(phoneNumbers),
  apiKeys: many(apiKeys),
  calls: many(calls),
  leads: many(leads),
  appointments: many(appointments),
  documents: many(documents),
}))

export const phoneNumbersRelations = relations(phoneNumbers, ({ one, many }) => ({
  business: one(businesses, { fields: [phoneNumbers.businessId], references: [businesses.id] }),
  calls: many(calls),
}))

export const callsRelations = relations(calls, ({ one, many }) => ({
  business: one(businesses, { fields: [calls.businessId], references: [businesses.id] }),
  phoneNumber: one(phoneNumbers, {
    fields: [calls.phoneNumberId],
    references: [phoneNumbers.id],
  }),
  leads: many(leads),
  appointments: many(appointments),
}))

export const leadsRelations = relations(leads, ({ one, many }) => ({
  business: one(businesses, { fields: [leads.businessId], references: [businesses.id] }),
  call: one(calls, { fields: [leads.callId], references: [calls.id] }),
  assignee: one(users, { fields: [leads.assignedTo], references: [users.id] }),
  appointments: many(appointments),
}))

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  business: one(businesses, { fields: [appointments.businessId], references: [businesses.id] }),
  call: one(calls, { fields: [appointments.callId], references: [calls.id] }),
  lead: one(leads, { fields: [appointments.leadId], references: [leads.id] }),
}))

export const documentsRelations = relations(documents, ({ one, many }) => ({
  business: one(businesses, { fields: [documents.businessId], references: [businesses.id] }),
  uploader: one(users, { fields: [documents.uploadedBy], references: [users.id] }),
  chunks: many(kbChunks),
}))

export const kbChunksRelations = relations(kbChunks, ({ one }) => ({
  business: one(businesses, { fields: [kbChunks.businessId], references: [businesses.id] }),
  document: one(documents, { fields: [kbChunks.documentId], references: [documents.id] }),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  business: one(businesses, { fields: [users.businessId], references: [businesses.id] }),
  assignedLeads: many(leads),
  sessions: many(sessions),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))

// ── inferred types (use across the data layer / API / MCP) ───────────────────

export type Business = typeof businesses.$inferSelect
export type NewBusiness = typeof businesses.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type BusinessHour = typeof businessHours.$inferSelect
export type NewBusinessHour = typeof businessHours.$inferInsert
export type BusinessFaq = typeof businessFaqs.$inferSelect
export type NewBusinessFaq = typeof businessFaqs.$inferInsert
export type EscalationContact = typeof escalationContacts.$inferSelect
export type NewEscalationContact = typeof escalationContacts.$inferInsert
export type PhoneNumber = typeof phoneNumbers.$inferSelect
export type NewPhoneNumber = typeof phoneNumbers.$inferInsert
export type ApiKey = typeof apiKeys.$inferSelect
export type NewApiKey = typeof apiKeys.$inferInsert
export type Call = typeof calls.$inferSelect
export type NewCall = typeof calls.$inferInsert
export type Lead = typeof leads.$inferSelect
export type NewLead = typeof leads.$inferInsert
export type Appointment = typeof appointments.$inferSelect
export type NewAppointment = typeof appointments.$inferInsert
export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
export type KbChunk = typeof kbChunks.$inferSelect
export type NewKbChunk = typeof kbChunks.$inferInsert
