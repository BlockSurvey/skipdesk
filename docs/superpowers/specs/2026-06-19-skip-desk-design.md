# Skip Desk — System Design Spec

> **Product:** Skip Desk — a multi-tenant voice AI front-desk platform. Businesses (hospitals, shops, event venues) get a phone number answered by an AI agent that shares business info, books appointments against real availability, and — when it can't help — captures the caller's intent as a lead and escalates to staff.
>
> **This spec covers:** data model → permissions → REST API → MCP servers/tools → dashboard → portability (local Postgres → Cloudflare D1) → build phases.

**Date:** 2026-06-19
**Status:** Design — pending implementation plan
**Decisions locked:** Multi-tenant from day one · Cloudflare **D1 (SQLite)** as cloud target · **Next.js** full-stack · capture call metadata + full transcript + AI summary/intent + recording URL.

---

## 1. Goals & non-goals

### Goals
1. A caller dials a business's number; the AI agent handles three intents:
   - **Info** — answer questions from the business's FAQ/info ("hours, services, location").
   - **Book** — check availability and book/confirm an appointment.
   - **Escalate** — when it can't fulfill the request, collect contact + intent accurately and tell the caller staff will reach out.
2. Persist everything: **calls**, **leads**, **appointments**, with full transcript + AI summary + recording.
3. Expose the data two ways:
   - **REST APIs** the voice platform (Vapi/Retell) calls *during* a call as custom tools + webhooks.
   - **MCP tools** for Claude / agent clients to look up, add, update, delete leads and appointments.
4. A **3-pane dashboard**: calls list · appointments list (with key summary) · calendar of booked appointments.
5. **Build in local Postgres first**, then port the same schema to **Cloudflare D1**.

### Non-goals (v1)
- No billing/subscriptions.
- No outbound campaign dialing (inbound front-desk only).
- No analytics warehouse — dashboard reads operational tables directly.
- No fine-grained Postgres row-level security (D1 can't honor it; see §3).

---

## 2. Architecture

```
                         ┌──────────────────────────────────────────────┐
  Caller ──phone──►  Voice Platform (Vapi/Retell)                         │
                         │   • answers, STT/LLM/TTS                       │
                         │   • calls REST "custom tools" mid-call ───────┐│
                         │   • posts call lifecycle webhook (end) ─────┐ ││
                         └─────────────────────────────────────────────┼─┼┘
                                                                        │ │
                    ┌───────────────────────────────────────────────┐  │ │
                    │            SKIP DESK (Next.js app)             │◄─┘ │ (tools)
                    │                                                │◄───┘ (webhook)
                    │  REST route handlers  ──┐                      │
                    │  MCP server (HTTP/stdio)─┼─► Data layer (Drizzle ORM)
                    │  Dashboard UI (3 panes) ─┘        │            │
                    └──────────────────────────────────┼────────────┘
                                                        ▼
                                  Local: Postgres  ║  Cloud: Cloudflare D1 (SQLite)
                                  (same Drizzle schema, two drivers)

  MCP clients (Claude Desktop / agents) ──► MCP server ──► Data layer
```

### Recommended stack (and why)
- **Next.js (App Router)** — one deployable holding REST route handlers, the MCP HTTP endpoint, and the dashboard UI. Deploys to Cloudflare (Workers/Pages) where D1 lives.
- **Drizzle ORM** — *the key portability choice.* One TypeScript schema definition generates migrations for **both** Postgres (local) and **D1/SQLite** (cloud). This is what makes "same tables in Postgres then D1" actually clean instead of hand-maintaining two DDLs.
- **MCP:** `@modelcontextprotocol/sdk` (TypeScript), sharing the Drizzle data layer with the REST routes — tools and APIs hit identical query functions.
- **Calendar UI:** FullCalendar (or react-big-calendar) for pane 3.
- **Auth:** per-business **API keys** for machine callers (voice platform + MCP); session auth for dashboard users.

> ★ Why Drizzle over raw SQL or Prisma: Prisma's D1 story is weaker; raw SQL means maintaining two dialects by hand. Drizzle has first-class `drizzle-orm/d1` and `drizzle-orm/node-postgres` drivers off one schema — exactly our "Postgres now, D1 later" requirement.

---

## 3. Permissions model (portable, not Postgres-RLS)

**Constraint:** D1/SQLite has **no row-level security and no DB roles**. So tenant isolation lives in the **application layer**, enforced on every query. This is the security model that ports.

### 3.1 Tenant isolation (mandatory)
- Every operational table carries `business_id`.
- Every data-layer function takes a `business_id` and **filters by it unconditionally**. There is no query path that reads cross-tenant rows.
- The `business_id` is derived from the **authenticated principal** (API key or user session), never from caller-supplied input.

### 3.2 Machine access — API keys (`api_keys` table)
- Each business has one or more API keys (hashed at rest).
- Keys carry **scopes**: `leads:read`, `leads:write`, `appointments:read`, `appointments:write`, `calls:read`, `calls:write`, `info:read`.
- The voice platform's custom tools use a key scoped to what a live call needs (`info:read`, `appointments:*`, `leads:write`, `calls:write`).
- The webhook ingestion endpoint uses a key with `calls:write`.

### 3.3 Human access — dashboard roles (`users.role`)
- `admin` — full access within their business (manage users, all data).
- `agent` — read/write leads & appointments, read calls.
- `viewer` — read-only.

### 3.4 Local Postgres roles (dev convenience only — NOT ported)
For least-privilege local development we create two Postgres roles. These do **not** travel to D1; tenant isolation above is the real model.
- `skip_desk_app` — `SELECT/INSERT/UPDATE/DELETE` on all tables (app runtime).
- `skip_desk_readonly` — `SELECT` only (local analytics / debugging).
- `skip_desk_owner` — DDL/migrations.

---

## 4. Data model (10 tables)

**Portability rules** (so one schema serves Postgres + D1/SQLite):
- **IDs:** `TEXT` UUIDv4 generated by the app (portable; avoids serial/sequence differences).
- **Timestamps:** stored as **ISO-8601 UTC `TEXT`**. (Postgres `TIMESTAMPTZ` and SQLite have different native types; ISO text is unambiguous on both. Drizzle maps it.)
- **Booleans:** `INTEGER` 0/1 (SQLite has no bool; Postgres accepts it).
- **Enums:** `TEXT` + `CHECK (col IN (...))` (SQLite has no enum type).
- **JSON blobs:** `TEXT` containing JSON (SQLite JSON1 / Postgres can parse).
- **Money/time numbers:** `INTEGER` (e.g., duration seconds).

> Columns below are the essential set; `created_at`/`updated_at` (ISO text) are on every operational table.

### 4.1 `businesses` — tenant root
| col | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| name | TEXT | |
| slug | TEXT UNIQUE | url-safe handle |
| timezone | TEXT | IANA, e.g. `Asia/Kolkata` — drives availability + appt display |
| locale | TEXT | default `en` |
| status | TEXT | `active` / `suspended` |
| created_at | TEXT | |

### 4.2 `business_hours` — open hours for "are we available now?"
| col | type | notes |
|---|---|---|
| id | TEXT PK | |
| business_id | TEXT FK→businesses | |
| day_of_week | INTEGER | 0=Sun … 6=Sat |
| open_time | TEXT | `HH:MM` |
| close_time | TEXT | `HH:MM` |
| closed | INTEGER | 1 = closed all day |

### 4.3 `business_faqs` — info the agent reads out
| col | type | notes |
|---|---|---|
| id | TEXT PK | |
| business_id | TEXT FK | |
| question | TEXT | |
| answer | TEXT | |
| tags | TEXT | comma/JSON tags for lookup |
| is_active | INTEGER | |

### 4.4 `escalation_contacts` — the "higher officials"
| col | type | notes |
|---|---|---|
| id | TEXT PK | |
| business_id | TEXT FK | |
| name | TEXT | |
| role | TEXT | e.g. "Front Office Manager" |
| phone | TEXT | |
| email | TEXT | |
| priority | INTEGER | lower = contacted first |

### 4.5 `phone_numbers` — inbound number → business routing
| col | type | notes |
|---|---|---|
| id | TEXT PK | |
| business_id | TEXT FK | **how a call is attributed to a tenant** |
| e164 | TEXT UNIQUE | `+1...` / `+91...` |
| provider | TEXT | `vapi` / `retell` / `twilio` / `plivo` |
| label | TEXT | |
| assistant_id | TEXT | provider assistant id |

### 4.6 `calls` — one row per call
| col | type | notes |
|---|---|---|
| id | TEXT PK | |
| business_id | TEXT FK | |
| phone_number_id | TEXT FK→phone_numbers | nullable |
| provider_call_id | TEXT | id from Vapi/Retell |
| caller_number | TEXT | |
| direction | TEXT | `inbound` / `outbound` |
| started_at | TEXT | |
| ended_at | TEXT | |
| duration_seconds | INTEGER | |
| outcome | TEXT CHECK | `info_provided` / `appointment_booked` / `lead_captured` / `escalated` / `transferred` / `abandoned` |
| recording_url | TEXT | nullable (consent-gated) |
| transcript | TEXT | full transcript |
| summary | TEXT | AI summary (dashboard) |
| intent | TEXT | detected intent/topic |
| sentiment | TEXT | `positive`/`neutral`/`negative` |
| raw_payload | TEXT(JSON) | full provider webhook for audit |

### 4.7 `leads` — captured intent / escalations
| col | type | notes |
|---|---|---|
| id | TEXT PK | |
| business_id | TEXT FK | |
| call_id | TEXT FK→calls | nullable |
| full_name | TEXT | required for callback |
| phone | TEXT | required, confirmed on call |
| email | TEXT | optional |
| reason | TEXT | intent in caller's words |
| preferred_time | TEXT | when they'd like to be reached/served |
| urgency | TEXT CHECK | `low`/`normal`/`high` |
| status | TEXT CHECK | `new`/`contacted`/`scheduled`/`closed` |
| escalated | INTEGER | 1 if routed to higher officials |
| assigned_to | TEXT FK→users | nullable |
| notes | TEXT | |
| created_at / updated_at | TEXT | |

### 4.8 `appointments` — bookings
| col | type | notes |
|---|---|---|
| id | TEXT PK | |
| business_id | TEXT FK | |
| call_id | TEXT FK→calls | nullable |
| lead_id | TEXT FK→leads | nullable |
| customer_name | TEXT | |
| customer_phone | TEXT | |
| customer_email | TEXT | nullable |
| service | TEXT | title/service requested |
| starts_at | TEXT | ISO UTC |
| ends_at | TEXT | ISO UTC |
| timezone | TEXT | display tz |
| status | TEXT CHECK | `pending`/`confirmed`/`cancelled`/`completed`/`no_show` |
| location | TEXT | |
| calendar_event_id | TEXT | nullable — Google Calendar sync (optional v1) |
| notes | TEXT | |
| created_at / updated_at | TEXT | |

### 4.9 `api_keys` — per-business machine access
| col | type | notes |
|---|---|---|
| id | TEXT PK | |
| business_id | TEXT FK | |
| name | TEXT | |
| key_hash | TEXT | hashed key |
| scopes | TEXT(JSON) | array of scope strings |
| last_used_at | TEXT | |
| revoked_at | TEXT | nullable |

### 4.10 `users` — dashboard logins
| col | type | notes |
|---|---|---|
| id | TEXT PK | |
| business_id | TEXT FK | |
| email | TEXT | unique per business |
| name | TEXT | |
| role | TEXT CHECK | `admin`/`agent`/`viewer` |
| password_hash | TEXT | (or OAuth later) |
| created_at | TEXT | |

### Relationships
```
businesses 1───* business_hours
businesses 1───* business_faqs
businesses 1───* escalation_contacts
businesses 1───* phone_numbers
businesses 1───* calls 1───0..1 leads
                  calls 1───0..1 appointments
businesses 1───* leads 1───0..* appointments
businesses 1───* api_keys
businesses 1───* users
```

---

## 5. REST API surface (Next.js route handlers)

Two audiences: **(A) voice platform** (live tools + webhook) and **(B) dashboard**. All authenticated by API key (A) or session (B); all scoped to `business_id`.

### 5.A Voice-platform endpoints (called mid-call as custom tools)
| Method · Path | Purpose | Scope |
|---|---|---|
| `POST /api/v1/tools/get-business-info` | Look up FAQ/hours to answer caller | `info:read` |
| `POST /api/v1/tools/check-availability` | Return open slots (business hours ± calendar) | `appointments:read` |
| `POST /api/v1/tools/book-appointment` | Create + confirm an appointment | `appointments:write` |
| `POST /api/v1/tools/capture-lead` | Save caller intent + contact, optionally escalate | `leads:write` |
| `POST /api/v1/webhooks/call` | Ingest call lifecycle (transcript/summary/recording) | `calls:write` |

> Tool endpoints accept the platform's function-call JSON (args + `toolCallId`) and return a small JSON the agent speaks back.

### 5.B Dashboard endpoints
| Method · Path | Purpose |
|---|---|
| `GET /api/v1/calls?from&to&outcome` | Calls list (pane 1) |
| `GET /api/v1/calls/:id` | Call detail (transcript/recording) |
| `GET /api/v1/appointments?from&to&status` | Appointments list + calendar (panes 2 & 3) |
| `GET/POST/PATCH/DELETE /api/v1/leads` | Lead CRUD |
| `GET/POST/PATCH/DELETE /api/v1/appointments` | Appointment CRUD |

---

## 6. MCP servers & tools

**Design:** one MCP server, tools grouped by domain, all sharing the same Drizzle data layer as the REST routes (no duplicated logic). The server resolves `business_id` from the API key passed at connection. Each tool has a **clear description** so the agent picks correctly during a conversation.

### 6.1 Leads tools
| Tool | Description (agent-facing) | Args |
|---|---|---|
| `create_lead` | Capture a caller's request when we can't serve them now, so staff can follow up. Always confirm phone. | full_name, phone, email?, reason, preferred_time?, urgency?, escalate? |
| `get_lead` | Fetch one lead by id. | id |
| `list_leads` | List/search leads by status, urgency, or date range. | status?, urgency?, from?, to? |
| `update_lead` | Update a lead's status, assignment, or notes (e.g., mark `contacted`). | id, fields |
| `delete_lead` | Remove a lead (admin/cleanup). | id |

### 6.2 Appointments tools
| Tool | Description | Args |
|---|---|---|
| `check_availability` | Check open slots for a date/range against business hours and existing appointments. | date/range, service?, timezone? |
| `create_appointment` | Book and confirm an appointment for a caller. | customer_name, customer_phone, service, starts_at, ends_at, email?, location?, lead_id? |
| `get_appointment` | Fetch one appointment. | id |
| `list_appointments` | List appointments by date range / status (feeds calendar). | from?, to?, status? |
| `update_appointment` | Reschedule, confirm, cancel, or annotate. | id, fields |
| `delete_appointment` | Delete an appointment. | id |

### 6.3 Info & calls tools
| Tool | Description | Args |
|---|---|---|
| `get_business_info` | Look up business hours / services / FAQ answers to tell the caller. | query/topic |
| `get_call` / `list_calls` | Retrieve call records + transcript/summary for review. | id / filters |
| `log_call_outcome` | Attach summary/intent/outcome to a call (usually via webhook, exposed for correction). | call_id, fields |

> Every tool is `business_id`-scoped server-side; the agent cannot read another tenant's data.

---

## 7. Dashboard (3 panes)

Single screen, three columns:
1. **Calls** (left) — reverse-chronological list: caller, time, duration, outcome badge; click → transcript + recording.
2. **Appointments** (middle) — upcoming list with **key summary** (customer, service, time, status) pulled from `appointments` + linked `calls.summary`.
3. **Calendar** (right) — FullCalendar month/week view of booked appointments; click an event → detail.

Filters: date range + business switcher (for multi-tenant admins). Data via §5.B endpoints. Realtime/refresh: polling for v1 (websockets later).

---

## 8. Local Postgres → Cloudflare D1 portability

1. **One schema** in Drizzle TS. `drizzle-kit` generates Postgres migrations for local and SQLite migrations for D1.
2. **Local:** `skip_desk` Postgres DB + `skip_desk_app`/`skip_desk_readonly`/`skip_desk_owner` roles.
3. **Cloud:** `skip-desk-db` D1 database via `wrangler d1`.
4. **Avoided dialect traps** (already baked into §4): no serial PKs, no native enum/bool/timestamp/JSONB, no RLS, no stored procedures.
5. **Seed data** (one demo business, hours, FAQs, escalation contact, a sample number) runs on both.

---

## 9. Build phases (each its own plan → implementation)

1. **Phase 1 — Database (local Postgres first).** Drizzle schema for all 10 tables, migrations, Postgres roles, seed script. ✅ *Start here — everything binds to this.*
2. **Phase 2 — Data layer + REST APIs.** Tenant-scoped query functions; voice-platform tool endpoints + webhook; dashboard read/CRUD endpoints; API-key auth.
3. **Phase 3 — MCP server.** All tools from §6 over the shared data layer, with descriptions; API-key→business_id resolution.
4. **Phase 4 — Dashboard.** Next.js 3-pane UI + calendar.
5. **Phase 5 — Cloudflare D1 port.** `wrangler` D1 create, run SQLite migrations, deploy, smoke test.
6. **Phase 6 — Voice platform wiring.** Point Vapi/Retell custom tools at the §5.A endpoints; webhook → ingestion.

---

## 10. Open items to confirm before/while building
- **Availability source for `check-availability`:** business hours + our `appointments` only (v1), or live Google Calendar? (`calendar_event_id` is reserved so we can add sync without migration.)
- **Auth for dashboard:** simple email+password for v1, or defer to OAuth/Clerk?
- **D1 timing:** build + verify fully on local Postgres through Phase 4, port in Phase 5 (recommended) — confirm you don't need D1 earlier.

---

*Spec authored via the brainstorming process. Next step: an implementation plan for Phase 1 (database), then build.*
