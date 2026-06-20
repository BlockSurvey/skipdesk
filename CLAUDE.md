# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: DB + MCP server + dashboard all built

Done: **(1)** Cloudflare D1 schema (`db/`); **(2)** the **MCP server** (`workers/mcp/`) — 15 voice-agent tools + `/register` + read-only dashboard API, deployed; **(3)** the **Next.js dashboard** (`app/`) — pick a business and see its calendar, callers + call summaries, leads, and KPIs on one page, plus an onboarding page.

**Live MCP server:** `https://skip-desk-mcp.sweet-night-5b17.workers.dev`
- MCP endpoint (Streamable HTTP, for Claude/Vapi): `…/mcp`
- Register a business → unique API key: `POST …/register`
- Dashboard read API (consumed by the Next app): `GET …/api/businesses`, `GET …/api/businesses/:id/dashboard`

## Dashboard (`app/` — Next.js 14 + Tailwind)

The repo root is the Next.js project (`app/` = App Router routes); the worker keeps its own `workers/mcp/tsconfig.json` so the two toolchains don't collide. The app is a **pure frontend** that reads the worker's JSON API (`lib/api.ts`, base = `NEXT_PUBLIC_MCP_BASE` or the deployed URL) — no D1 binding needed, so `npm run dev` just works.
- Routes: `/` (choose/create business), `/business/[id]` (one-page analytics: KPIs, charts, appointment calendar, callers+summaries, leads), `/register` (onboarding form → shows the API key once).
- `components/` — `BusinessSwitcher`, `CalendarBoard`, `CallsFeed`, `LeadsList`, `Charts` (recharts), `Brand`, `Badge`. `lib/format.ts` holds the status/outcome/sentiment color maps + tz-aware time formatting.
- Aesthetic: dark "voice-ops console" — Instrument Serif display + JetBrains Mono data; amber=signal, teal=booked/positive, rose=escalation. Tokens in `app/globals.css`.
- Commands: `npm run dev` / `npm run build` / `npm run start`.
- Demo analytics data: `node db/seed-analytics.mjs > db/seed-analytics.sql` then `wrangler d1 execute skip-desk-db --remote --file db/seed-analytics.sql` (regenerates the demo clinic's calls/appointments/leads).

Authoritative documents:
- `docs/superpowers/specs/2026-06-19-skip-desk-design.md` — **the system design spec.** Data model (10 tables), permissions, REST + MCP surface, dashboard, build phases. Source of truth for *what* to build. **Deviation:** the spec's "local Postgres first, then port to D1" plan was dropped — we build **D1/SQLite-only** (see constraints below). Ignore the spec's Postgres roles (§3.4) and Postgres-first phasing (§8).
- `docs/FRONT_DESK_VOICE_AGENT_BUILD_GUIDE.md` — research-backed guide for wiring the external **voice platform** (Vapi/Retell): assistant prompt, tools, telephony, webhooks. Phase 6 / external-integration reference, not the app itself.

## Database (`db/`) — commands & layout

Single Drizzle `sqlite-core` schema is the source of truth; D1 is SQLite, so dev and prod are the same dialect (no Postgres).
- `db/schema.ts` — 10 tables + relations + inferred `$inferSelect/$inferInsert` types. **Import these types in the data layer/API/MCP; don't redefine row shapes.**
- `db/enums.ts` — enum value arrays + TS unions; reused to build the schema's CHECK constraints, so DB/types/validation can't drift.
- `db/client.ts` — `createDb(env.DB)` → Drizzle D1 client with the relational query API.
- `db/migrations/` — generated SQL (tracked in git). `db/seed.sql` — demo tenant.
- `wrangler.toml` — D1 binding `DB` → `skip-desk-db`.

Commands (Cloudflare creds come from `.env`):
- `npm run db:generate` — regenerate migration after editing `schema.ts`. **Always do this; never hand-edit migration SQL.**
- `npm run d1:migrate` — apply migrations to the live D1 (`--remote`).
- `npm run d1:seed` — load `db/seed.sql`.
- `npm run db:studio` — browse D1 via Drizzle Studio.

## What Skip Desk is

A **multi-tenant voice AI front-desk platform.** A business gets a phone number answered by an AI agent that (1) answers info questions from the business's FAQ, (2) books appointments against real availability, and (3) when it can't help, captures the caller's intent as a lead and escalates to staff. The external voice platform (Vapi/Retell) handles the call; **this codebase is the backend + dashboard** the voice platform calls into.

## Architecture (the big picture)

One Next.js (App Router) deployable holds three things over **one shared Drizzle data layer**:
1. **REST route handlers** — two audiences: voice-platform tools/webhooks (called *mid-call*, e.g. `POST /api/v1/tools/book-appointment`, `/api/v1/webhooks/call`) and dashboard read/CRUD endpoints.
2. **MCP server** (`@modelcontextprotocol/sdk`) — leads/appointments/info/calls tools for Claude/agent clients. Tools and REST routes **must call the identical query functions** — no duplicated DB logic.
3. **Dashboard UI** — 3-pane: calls list · appointments list · calendar (FullCalendar).

Request → auth (API key for machines, session for humans) → resolve `business_id` from the principal → tenant-scoped query function → DB.

## Non-negotiable constraints (the whole design hinges on these)

These are not style preferences — violating them breaks multi-tenancy or query performance.

1. **Tenant isolation is application-layer, enforced on every query.** D1/SQLite has no row-level security and no DB roles. Every operational table carries `business_id`; every data-layer function takes a `business_id` and filters by it unconditionally. `business_id` comes from the **authenticated principal (API key or session), never from caller/request input.** There must be no query path that can read across tenants.

2. **Indexes lead with `business_id`.** Because every query filters by tenant, composite indexes are `(business_id, <filter/sort col>)` — e.g. `(business_id, started_at)` for the calls list, `(business_id, starts_at)` for the appointments calendar. New list/search queries need a matching leading-`business_id` index. Auth hot paths (`api_keys.key_hash`, `phone_numbers.e164`) are unique-indexed.

3. **One Drizzle `sqlite-core` schema; D1 only.** `db/schema.ts` is the single source of truth; `drizzle-orm/d1` is the driver. Don't hand-write DDL, add Prisma, or reintroduce Postgres. Column conventions (already in the schema, keep them): IDs = `TEXT` app-generated UUIDv4 (`crypto.randomUUID()`, no autoincrement); timestamps = ISO-8601 UTC `TEXT`; booleans = `INTEGER` 0/1 via Drizzle `mode:'boolean'`; enums = `TEXT` + `CHECK` (built from `db/enums.ts`); JSON = `TEXT` via `mode:'json'`.

4. **API keys carry scopes** (`leads:read`, `appointments:write`, `calls:write`, `info:read`, …) and are hashed at rest. Voice-platform tools and the webhook endpoint use keys scoped to only what they need.

## Build phases (each is its own plan → implementation)

Build in order; everything binds to the database.
1. ✅ **Database (D1)** — `db/` schema, migration, seed, live `skip-desk-db`. Done.
2. ✅ **MCP server** (`workers/mcp/`) — 15 tenant-scoped tools + `/register` onboarding, deployed. Done.
3. **Dashboard** (next) — registration page + 3-pane UI (calls · appointments · calendar). Reuses `db/` + the same query patterns.
4. **Voice platform wiring** — point the Vapi/Retell assistant's MCP/tools at the live `/mcp` URL with the business's `Bearer` key (see the build guide).

## MCP server (`workers/mcp/`)

Cloudflare Worker over D1, exposing the voice-agent tool surface as MCP tools. One `db/` schema is shared with the worker.
- **Transport:** `/mcp` is **stateless** Streamable HTTP (`src/mcp.ts`) — each request is self-contained, so there's no session to go stale (fixes Claude's "tool not registered"). `/sse` is the legacy Durable-Object `McpAgent` path. **Both serve the identical registry** (`buildRegistry()` in `src/mcp.ts`; tools defined as plain `ToolDef`s via `createRegistrar` in `src/context.ts`, mounted on the SSE server by `mountOnServer`). Add tools in `src/tools/*` — they appear on both transports automatically.
- **Caller identity** (`src/lib/customer.ts`): a caller is unique by `(business_id, E.164 phone)` — never by name. `resolveContact()` is the single dedup-by-phone upsert; `create_lead` and `book_appointment` both go through it, so a caller is **stored once and reused** (booking stores the caller if not found). Phones are normalized with the business's country code (from its timezone) — see `db/.../specs/2026-06-19-customer-identity-and-edge-cases.md`.
- `src/index.ts` — fetch handler + routes (`/register`, `/api/businesses`, `/mcp`, `/sse`, `/`). Resolves the tenant from `Authorization: Bearer <key>`.
- `src/auth.ts` — SHA-256 hex of the raw key → `api_keys.key_hash` → `{ businessId, scopes }`. This is the **canonical key hash** (registration uses the same).
- `src/register.ts` — `POST /register` self-serve onboarding: creates a business (UUID), default Mon–Fri 09:00–18:00 hours, optional escalation contact, and one API key with full scopes (raw key returned ONCE).
- `src/context.ts` — `makeRegistrar()` wraps every tool with scope-checking + error handling; `DEMO_BUSINESS_ID` (mirrors `db/seed.sql`) is the no-auth fallback tenant for testing.
- `src/tools/*` — info, leads (incl. `lookup_caller`), appointments, escalation, calls. `src/lib/` — `validate` (phone→E.164, ISO-UTC, enums), `availability` (open-hours minus bookings), `time` (tz).

**Tenancy & clean data:** every tool resolves `business_id` from the authenticated key (never from args) and validates/normalizes inputs before writing — so a business's data is isolated and only clean rows land. No-auth requests fall back to the demo tenant (testing only); real businesses must send their key.

Commands: `npm run mcp:deploy` (deploy), `npm run mcp:dev` (local), `npm run mcp:tail` (logs).

## Tests (`tests/`)

End-to-end against the **deployed** MCP server, driving real caller workflows over the MCP protocol (new caller, returning caller, escalation, clean-data guards, overlap/adjacency, reschedule/cancel slot-freeing, multi-tenant isolation, scope enforcement, onboarding).
- `npm run test:e2e` — core workflows (45 assertions).
- `npm run test:setup` → `npm run test:e2e:advanced` → `npm run test:teardown` — advanced suite (40 assertions; setup seeds a 2nd tenant `biz_test2`, teardown removes all test rows).
- `npm run test:e2e:identity` — caller identity / dedup edge cases (23 assertions).
- `npm run test:register` — onboarding (14 assertions).
- Test rows use `+1999000xxxx` phones / `test_call_*`/`adv_*` ids; `tests/fixtures-teardown.sql` cleans everything. Cloudflare creds must be exported (or `wrangler login`).

## Environment

`.env` (gitignored) holds `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_DATABASE_ID` — used by `drizzle-kit` (d1-http driver) and `wrangler`. The `POSTGRES_*` vars are leftover and unused (we went D1-only). Cloud target: Cloudflare Workers + D1.

> ⚠️ The live Cloudflare API token currently sits in `.env` in plaintext (gitignored, so not committed). Rotate it if it leaks; don't paste it into tracked files.

## Open design questions (confirm before building the relevant piece)

- `check-availability` source: business hours + our `appointments` only (v1), or live Google Calendar? (`appointments.calendar_event_id` is reserved so sync can be added without a migration.)
- Dashboard auth: email+password for v1, or OAuth/Clerk?
