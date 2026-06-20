# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: DB + MCP server + dashboard + accounts/auth + knowledge-base RAG + web voice widget all built

**Web voice widget — see `docs/superpowers/specs/2026-06-20-voice-widget-lead-capture-design.md`.** A business turns on a **Vapi web voice widget** from **/widget** and embeds it on their own site (`<script src="…/embed.js" data-business="<slug>">`) or shares the hosted page **/talk/[slug]**. It works like their phone number — answers visitors and captures leads into their tenant. Architecture: **one shared Vapi assistant** (`VAPI_ASSISTANT_ID`), made multi-tenant at the edges — at call start the browser injects the business's public context as Vapi `variableValues` (from public **`GET /widget/config?slug=`**) — including **clock variables** (`CURRENT_DATE`/`CURRENT_TIME`/`CURRENT_DATETIME`, rendered server-side in the business's `TIMEZONE`) so the agent never guesses the weekday (the business tz is the single authoritative clock; fixes wrong-day drift). Every date-returning MCP tool also returns a ready-to-speak local label (`check_availability`→`today`+per-slot `label`; appointment tools→`when`) the agent reads verbatim instead of converting UTC itself. Then at call end Vapi POSTs an `end-of-call-report` to the signed **`POST /api/v1/webhooks/vapi`** (`X-Vapi-Secret` = `VAPI_WEBHOOK_SECRET`), which reads `businessId` from the call and writes the lead+call via the existing `resolveContact`/`calls` logic (idempotent on the Vapi call id). The browser only ever holds non-secrets (Vapi **public** key + assistant id); `/widget/config` returns only public info (name, hours, FAQ summary), never leads/calls/KB. Owner toggle: `businesses.widget_enabled` via session-gated `GET /api/me/widget` + `POST /api/me/widget/enable`. v1 deviations (upgrade paths, no migration): injected FAQ summary (not live KB RAG); single shared assistant (not per-business). Worker secrets: `VAPI_PUBLIC_KEY`, `VAPI_WEBHOOK_SECRET`; var: `VAPI_ASSISTANT_ID` in `workers/mcp/wrangler.toml`. Next surfaces: `app/talk/[slug]`, `app/widget`, `components/{VapiWidget,WidgetManager}.tsx`, `public/embed.js`; worker: `workers/mcp/src/widget.ts`.

**Mid-call MCP tenant routing (the shared assistant's `skip_desk` tool).** The shared Vapi assistant has an **MCP tool** pointed at `…/mcp`, so it calls `book_appointment`/`create_lead`/`log_call`/etc. **during** the call (not only via the post-call webhook). Multi-tenancy here is non-obvious: **Vapi does NOT forward a call's `variableValues` into MCP tool requests** — the only per-call context it injects is the **`X-Call-Id`** header. So `workers/mcp/src/index.ts` resolves the tenant for the `/mcp` path as follows: when there's **no `Authorization: Bearer` key** but the request carries the static **`X-Skipdesk-Secret`** (= worker secret `MCP_TOOL_SECRET`, also configured as a header on the Vapi tool) and an `X-Call-Id`, it calls `resolveVapiCallPrincipal()` (`workers/mcp/src/vapiTenant.ts`) → `GET https://api.vapi.ai/call/{id}` authed with `VAPI_PRIVATE_KEY` → reads `assistantOverrides.variableValues.businessId` → acts as that tenant (full scopes; 10-min per-isolate cache). `business_id` thus comes from a **server-verified source** (Vapi's own call record), never request input — mirroring the webhook's trust model, and **without exposing any per-business secret to the browser** (the page only ever sets the non-secret `businessId`). The Bearer-key path (Claude clients) and the no-auth demo fallback are unchanged. New worker secrets: `VAPI_PRIVATE_KEY`, `MCP_TOOL_SECRET`. Known gap (out of scope): inbound calls to the **shared phone number** carry no `businessId` (no browser injects it) → they fall to the demo tenant; a per-`phone_numbers.e164` → business mapping would close it.

Done: **(1)** Cloudflare D1 schema (`db/`); **(2)** the **MCP server** (`workers/mcp/`) — 16 voice-agent tools + `/register` + email/password auth + onboarding + per-owner dashboard API + **knowledge-base document upload/RAG**, deployed; **(3)** the **Next.js product** (`app/`) — a marketing landing page, **signup/login (email+password, no verification)**, a 3-step **onboarding wizard**, a session-gated **/dashboard** (the owner's own business: calendar, callers+summaries, leads, KPIs), a **/knowledge** page (document upload + RAG search), and a **/settings** page (profile, hours, FAQs, escalation, API-key rotation).

**Knowledge base (document RAG) — see `docs/superpowers/specs/2026-06-20-knowledge-base-document-rag-design.md`.** Owners upload PDF/DOCX/TXT/MD on **/knowledge**; the worker stores the blob in **Cloudflare R2** (`DOCS` binding, bucket `skip-desk-docs`, key `documents/{business_id}/{id}/{file}`), then inline (via `ctx.waitUntil`) converts it with **Workers AI** (`AI` binding) `toMarkdown`, chunks it, embeds with `@cf/baai/bge-base-en-v1.5`, and stores the vectors **in D1** (`kb_chunks.embedding` JSON — vectors stay in D1; R2 = blobs, AI = compute, the one documented "D1-only" deviation). The **`search_knowledge_base`** MCP tool (scope `knowledge:read`) embeds the query and brute-force cosine-ranks the tenant's chunks. Tables: `documents` (lifecycle pending/processing/ready/failed) + `kb_chunks`. Upgrade paths (no migration): vectors → Vectorize, inline ingest → Queue.

**Accounts/auth model — see `docs/superpowers/specs/2026-06-20-accounts-onboarding-auth-design.md`.** Single **owner per business**. Passwords are **PBKDF2-HMAC-SHA256 hashed** (never plaintext). Sessions are **stateless ES256 JWTs** (14-day TTL): the worker **signs** with a private key (`JWT_PRIVATE_JWK` worker secret), and anyone **verifies** with the public key (committed in `lib/jwt-public-key.ts`) — so the UI verifies a session locally with no round-trip. The Next app proxies auth through its own Route Handlers and stores the JWT in an **httpOnly `sd_session` cookie** (never exposed to browser JS); `middleware.ts` does a coarse edge gate while `getSession()` does the authoritative signature verification. Logout is stateless (the UI clears the cookie; tokens aren't server-revoked). The **voice-agent/MCP path stays API-key based and unchanged**; auth only gates the human dashboard.

**Live MCP server:** `https://skip-desk-mcp.sweet-night-5b17.workers.dev`
- MCP endpoint (Streamable HTTP, for Claude/Vapi): `…/mcp`
- Register a business (machine, returns key once): `POST …/register`
- Auth (human owners): `POST …/auth/signup`, `…/auth/login`, `…/auth/logout`, `GET …/auth/me`
- Onboarding + owner API (session-gated): `POST …/onboarding`, `GET …/api/me/dashboard`, `…/api/me/config`, `PATCH …/api/me/business`, `PUT …/api/me/{hours,faqs,escalation}`, `POST …/api/me/key/rotate`, `POST/GET …/api/me/documents`, `GET/DELETE …/api/me/documents/{id}`, `POST …/api/me/knowledge/search`

## Dashboard / product (`app/` — Next.js 14 + Tailwind)

The repo root is the Next.js project (`app/` = App Router routes); the worker keeps its own `workers/mcp/tsconfig.json` so the two toolchains don't collide. The app reads the worker's JSON API and **manages auth itself**: `lib/auth-server.ts` (`getSession()`, `workerFetch()`), Route Handlers under `app/api/auth/*` set/clear the `sd_session` cookie, `app/api/proxy/[...path]` is a same-origin authed proxy to the worker, and `middleware.ts` gates `/dashboard`, `/settings`, `/onboarding`. Base URL = `NEXT_PUBLIC_MCP_BASE` or the deployed URL.
- Routes: `/` (marketing landing), `/signup`, `/login`, `/onboarding` (3-step wizard → API key once), `/dashboard` (owner's analytics: KPIs, charts, calendar, callers+summaries, leads), `/settings`.
- `components/` — `AuthForm`, `OnboardingWizard`, `SettingsForm`, `AppShell` (sidebar + account menu/logout), `CalendarBoard`, `CallsFeed`, `LeadsList`, `Charts` (recharts), `Brand`, `Badge`, `ClientOnly`. `lib/format.ts` holds the status/outcome/sentiment color maps + tz-aware time formatting.
- Aesthetic: light "front-desk console" — Hanken Grotesk + JetBrains Mono; amber=signal, teal=booked/positive, rose=escalation. Tokens in `app/globals.css`.
- **Only ever run ONE `next dev` at a time** — concurrent dev servers (or `next build` while `next dev` runs) corrupt the shared `.next/` (the `@opentelemetry` vendor-chunk / "missing required error components" failures). Verify by **compile + test**, not by running the server.
- Commands: `npm run dev` / `npm run build` / `npm run start`.
- Demo analytics data: `node db/seed-analytics.mjs > db/seed-analytics.sql` then `wrangler d1 execute skip-desk-db --remote --file db/seed-analytics.sql` (regenerates the demo clinic's calls/appointments/leads).

Authoritative documents:
- `docs/superpowers/specs/2026-06-19-skip-desk-design.md` — **the system design spec.** Data model (10 tables), permissions, REST + MCP surface, dashboard, build phases. Source of truth for *what* to build. **Deviation:** the spec's "local Postgres first, then port to D1" plan was dropped — we build **D1/SQLite-only** (see constraints below). Ignore the spec's Postgres roles (§3.4) and Postgres-first phasing (§8).
- `docs/FRONT_DESK_VOICE_AGENT_BUILD_GUIDE.md` — research-backed guide for wiring the external **voice platform** (Vapi/Retell): assistant prompt, tools, telephony, webhooks. Phase 6 / external-integration reference, not the app itself.

## Database (`db/`) — commands & layout

Single Drizzle `sqlite-core` schema is the source of truth; D1 is SQLite, so dev and prod are the same dialect (no Postgres).
- `db/schema.ts` — 12 tables + relations + inferred `$inferSelect/$inferInsert` types (incl. `documents` + `kb_chunks` for the knowledge base). **Import these types in the data layer/API/MCP; don't redefine row shapes.**
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
2. ✅ **MCP server** (`workers/mcp/`) — 16 tenant-scoped tools (incl. `search_knowledge_base`) + `/register` onboarding + document RAG, deployed. Done.
3. **Dashboard** (next) — registration page + 3-pane UI (calls · appointments · calendar). Reuses `db/` + the same query patterns.
4. **Voice platform wiring** — point the Vapi/Retell assistant's MCP/tools at the live `/mcp` URL with the business's `Bearer` key (see the build guide).

## MCP server (`workers/mcp/`)

Cloudflare Worker over D1, exposing the voice-agent tool surface as MCP tools. One `db/` schema is shared with the worker.
- **Transport:** `/mcp` is **stateless** Streamable HTTP (`src/mcp.ts`) — each request is self-contained, so there's no session to go stale (fixes Claude's "tool not registered"). `/sse` is the legacy Durable-Object `McpAgent` path. **Both serve the identical registry** (`buildRegistry()` in `src/mcp.ts`; tools defined as plain `ToolDef`s via `createRegistrar` in `src/context.ts`, mounted on the SSE server by `mountOnServer`). Add tools in `src/tools/*` — they appear on both transports automatically.
- **Caller identity** (`src/lib/customer.ts`): a caller is unique by `(business_id, E.164 phone)` — never by name. `resolveContact()` is the single dedup-by-phone upsert; `create_lead` and `book_appointment` both go through it, so a caller is **stored once and reused** (booking stores the caller if not found). Phones are normalized with the business's country code (from its timezone) — see `db/.../specs/2026-06-19-customer-identity-and-edge-cases.md`.
- `src/index.ts` — fetch handler + routes (`/register`, `/auth/*`, `/onboarding`, `/api/me/*`, `/mcp`, `/sse`, `/`). Resolves the machine tenant from `Authorization: Bearer <key>`.
- `src/auth.ts` — SHA-256 hex of the raw key → `api_keys.key_hash` → `{ businessId, scopes }`. This is the **canonical hash** (registration, sessions, and key rotation all use it).
- `src/register.ts` — `POST /register` self-serve onboarding (machine): creates a business (UUID), default Mon–Fri 09:00–18:00 hours, optional escalation contact, and one API key (raw key returned ONCE). Exports `slugify` + `newApiKey` (reused by `account.ts`).
- **Dashboard auth (human owners):** `src/lib/password.ts` (PBKDF2 hash/verify), `src/lib/jwt.ts` (ES256 `signSession`/`verifyToken` using the `JWT_PRIVATE_JWK` secret; public key derived from it), `src/lib/session.ts` (`issueToken`, `resolveAuth` = verify JWT + load user/business from D1, `sessionToken` cookie/Bearer parsing), `src/authRoutes.ts` (`/auth/signup|login|logout|me`), `src/account.ts` (`/onboarding` re-issues a fresh token + session-gated `/api/me/*`: dashboard, config, business PATCH, hours/faqs/escalation PUT, key rotate). Every `/api/me/*` route resolves `business_id` from the session's user — never from the URL/body. The `sessions` D1 table is currently unused (reserved for a future refresh-token/denylist; auth is stateless JWT). Set the signing key once with `echo "$JWT_PRIVATE_JWK" | npx wrangler secret put JWT_PRIVATE_JWK -c workers/mcp/wrangler.toml`.
- `src/context.ts` — `makeRegistrar()` wraps every tool with scope-checking + error handling; `DEMO_BUSINESS_ID` (mirrors `db/seed.sql`) is the no-auth fallback tenant for testing.
- `src/tools/*` — info, leads (incl. `lookup_caller`), appointments, escalation, calls, knowledge (`search_knowledge_base`). `src/lib/` — `validate` (phone→E.164, ISO-UTC, enums), `availability` (open-hours minus bookings), `time` (tz), `knowledge` (chunk/embed/cosine/search). `src/documents.ts` — session-gated upload/list/delete + R2 + inline `ctx.waitUntil` ingestion. Tool ctx carries `ai` (Workers AI) alongside `db`.

**Tenancy & clean data:** every tool resolves `business_id` from the authenticated key (never from args) and validates/normalizes inputs before writing — so a business's data is isolated and only clean rows land. No-auth requests fall back to the demo tenant (testing only); real businesses must send their key.

Commands: `npm run mcp:deploy` (deploy), `npm run mcp:dev` (local), `npm run mcp:tail` (logs).

## Tests (`tests/`)

End-to-end against the **deployed** MCP server, driving real caller workflows over the MCP protocol (new caller, returning caller, escalation, clean-data guards, overlap/adjacency, reschedule/cancel slot-freeing, multi-tenant isolation, scope enforcement, onboarding).
- `npm run test:e2e` — core workflows (45 assertions).
- `npm run test:setup` → `npm run test:e2e:advanced` → `npm run test:teardown` — advanced suite (40 assertions; setup seeds a 2nd tenant `biz_test2`, teardown removes all test rows).
- `npm run test:e2e:identity` — caller identity / dedup edge cases (23 assertions).
- `npm run test:e2e:auth` — accounts/auth/onboarding: signup, login, onboarding, tenant isolation, key rotation, logout, **JWT shape + ES256 + 14-day TTL** (30 assertions; uses `authtest+<ts>@example.test` accounts — clean up by `email LIKE 'authtest+%@example.test'` / `name LIKE 'Auth Test %'`).
- `npm run test:e2e:knowledge` — knowledge-base RAG: upload → poll to `ready` → `search_knowledge_base` retrieves the fact with source citation → tenant isolation → dashboard test-search → delete cleanup (19 assertions; uses `kbtest+<ts>@example.test` accounts / `KB Test %` businesses — purged by `fixtures-teardown.sql`).
- `npm run test:register` — machine onboarding (14 assertions).
- Test rows use `+1999000xxxx` phones / `test_call_*`/`adv_*` ids; `tests/fixtures-teardown.sql` cleans everything. Cloudflare creds must be exported (or `wrangler login`).

## Environment

`.env` (gitignored) holds `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_DATABASE_ID` — used by `drizzle-kit` (d1-http driver) and `wrangler`. The `POSTGRES_*` vars are leftover and unused (we went D1-only). Cloud target: Cloudflare Workers + D1.

> ⚠️ The live Cloudflare API token currently sits in `.env` in plaintext (gitignored, so not committed). Rotate it if it leaks; don't paste it into tracked files.

## Open design questions (confirm before building the relevant piece)

- `check-availability` source: business hours + our `appointments` only (v1), or live Google Calendar? (`appointments.calendar_event_id` is reserved so sync can be added without a migration.)
- ~~Dashboard auth: email+password for v1, or OAuth/Clerk?~~ **Resolved:** email+password, no verification, self-hosted on Cloudflare — **stateless ES256 JWT** sessions (private key signs in the worker, public key verifies on the UI), PBKDF2-hashed passwords. See the accounts/auth spec.

Future (out of scope for v1, not blocked by the design): teams/invites, email verification, password reset, OAuth, rate-limiting, billing.
