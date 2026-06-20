# Skip Desk — Accounts, Onboarding & Settings (design spec)

**Date:** 2026-06-20
**Status:** approved (build)
**Goal:** Turn Skip Desk into a complete, enterprise-grade product: a marketing landing page, email+password auth (no verification), a guided onboarding wizard, a gated per-owner dashboard, and a settings area — all Cloudflare-native (Workers + D1), reusing the existing data layer.

## 1. Scope & decisions (locked)

- **Auth:** email + password, **no email verification**. Self-hosted on Cloudflare (no Clerk/Auth0).
- **User model:** **single owner per business.** One signup = one user who owns one business. (Teams are a future extension; schema won't block it.)
- **Onboarding:** **Standard wizard** — Business basics → Hours → Agent preferences → done screen reveals the API key once. Everything editable later in Settings.
- **Landing:** one-page marketing site targeting the ICP (small-business owners who miss inbound calls).

## 2. Architecture

Keep the existing split: **Worker = D1 backend** (auth, onboarding, dashboard reads, MCP); **Next app = UI**. Auth lives in the Worker; the Next app proxies auth through its own Route Handlers and holds an **httpOnly session cookie** on its own origin.

- The browser only talks to **Next** (same-origin → no CORS).
- Next calls the Worker **server-side** with the session token; the raw token is **never exposed to the browser**.
- The **MCP / voice-agent path stays API-key-based and unchanged.** Auth is only for the human dashboard.

## 3. Auth mechanics (Cloudflare-native)

- **Password hashing:** PBKDF2-HMAC-SHA256 via Web Crypto (`crypto.subtle`), 100,000 iterations, random 16-byte salt. Stored as `pbkdf2$<iters>$<saltB64>$<hashB64>`. Verify with constant-time compare.
- **Sessions:** opaque 32-byte random token (hex). Stored in D1 as **SHA-256 hash only** (mirrors `api_keys`). Cookie `sd_session`: httpOnly, Secure, SameSite=Lax, Path=/, Max-Age 30 days.
- **Email:** normalized to lowercase, **globally unique**.

## 4. Schema changes (`db/schema.ts`; regenerate migration — never hand-edit SQL)

1. **New `sessions` table:**
   - `id` (uuid pk), `userId` → `users.id` (cascade delete), `tokenHash` text, `createdAt`, `expiresAt` text (ISO), `lastSeenAt` text.
   - `uniqueIndex` on `tokenHash`; index on `userId`.
2. **`users`:**
   - `businessId` → **nullable** (signup precedes business creation).
   - Add `uniqueIndex` on `email` (global).
   - `role` default stays; add `'owner'` to `USER_ROLES`.
3. **`businesses`** — add nullable/defaulted columns:
   - `industry` (text), `phone` (text), `address` (text), `agentName` (text), `greeting` (text), `defaultAppointmentMinutes` (integer, default 30).
4. **`enums.ts`:** `USER_ROLES = ['owner','admin','agent','viewer']`.

All changes are additive or relaxing (nullable) → safe on the live DB.

## 5. API surface

### Worker (new / changed) — `workers/mcp/src/`
- `POST /auth/signup` `{ email, password, name }` → creates user (no business), creates session. Returns `{ user, session_token }`. `409` if email exists; validates password length ≥ 8.
- `POST /auth/login` `{ email, password }` → verify → session. `401` on bad creds.
- `POST /auth/logout` → delete current session. `204`.
- `GET /auth/me` → from token → `{ user, business | null, onboarded }`.
- `POST /onboarding` *(auth required)* `{ name, industry?, timezone, phone?, address?, agentName?, greeting?, defaultAppointmentMinutes?, hours? }` → creates business, sets `user.businessId`, seeds hours (provided or Mon–Fri 09:00–18:00), mints the **API key (returned once)**. `409` if the user already owns a business.
- `PATCH /api/business` *(auth)* → update profile + preferences. `PUT /api/business/hours` → replace hours. (FAQs/escalation editors may reuse existing patterns.) `POST /api/business/key/rotate` → revoke + mint a new API key (returned once).
- Existing `GET /api/businesses/:id/dashboard` → **requires session**, resolves `businessId` from the user (ignores any id that isn't theirs → `403`). The public **list-all-businesses endpoint is removed.**

**Auth resolution in the worker:** a request is authenticated by either `Authorization: Bearer <session_token>` or the `sd_session` cookie → look up `sessions.tokenHash` → user → business. Shared helper `resolveSession()` alongside `resolveApiKey()`.

### Next Route Handlers (same-origin; manage the cookie) — `app/api/`
- `POST /api/auth/signup`, `/login` → call worker, on success **set** `sd_session` httpOnly cookie, return `{ onboarded }`.
- `POST /api/auth/logout` → call worker, **clear** cookie.
- `POST /api/onboarding`, `PATCH /api/business`, etc. → proxy with the cookie token server-side.
- `lib/session.ts` `getSession()` — server helper: read cookie → worker `/auth/me` → `{ user, business, onboarded } | null`. Cached per request.
- `middleware.ts` — gate routes: unauthenticated → `/login`; authenticated-but-not-onboarded → `/onboarding`; authenticated visiting `/login`|`/signup` → `/dashboard`.

## 6. UI (Next app, App Router)

- **`/` — one-page landing** (replaces the business-picker). Sections: hero (value prop), the problem (missed calls = lost revenue), the solution + Heard/Assisted/Guided pillars, how it works (3 steps), closing CTA. Header has Sign in / Get started. Enterprise-clean, matches existing light design tokens.
- **`/signup`** — name, email, password → account + auto-login → `/onboarding`.
- **`/login`** — email, password → `/dashboard` (or `/onboarding`).
- **`/onboarding`** — 3-step wizard with progress: (1) Business basics (name, industry, timezone, phone, address), (2) Hours editor, (3) Agent preferences (agent name, greeting, default appointment length) → submit → **API key reveal (once)** → CTA into the dashboard.
- **`/dashboard`** — the existing analytics page, now scoped to the owner's business (resolved from the session). Replaces `/business/[id]` as the canonical authed view.
- **`/settings`** — tabs/sections: Business profile, Preferences, Hours, FAQs, Escalation contacts, API key (view masked / rotate), Account (name, change password, log out).
- **Shell:** authed pages share a top bar / sidebar with the business name and an account menu (logout). No cross-tenant switcher.

## 7. Security & tenancy

- Reaffirms constraint #1: every authed query resolves `businessId` from the **session's user**, never from URL/body.
- Session token only in an httpOnly cookie; only its hash stored; 30-day expiry; logout deletes the row.
- Passwords never logged; PBKDF2 with per-user salt.
- Rate-limiting and password reset are **out of scope for v1** (noted as follow-ups).

## 8. Testing

Extend the e2e harness (`tests/`):
- signup (happy + duplicate email + weak password), login (happy + wrong password + unknown email), logout, `/auth/me`.
- onboarding (happy + "already onboarded" 409), business profile update, API-key rotation.
- **Cross-tenant access → 403** (user A cannot read user B's dashboard).
- Existing MCP + identity + register tests stay green.

## 9. Build order (phased)

1. **Schema + auth backend** — `sessions` table, `users.businessId` nullable, business preference columns, PBKDF2 + session helpers, worker `/auth/*` + `/onboarding` + ownership-scoped reads + key rotation.
2. **Next auth integration** — route handlers, `sd_session` cookie, `getSession()`, `middleware.ts`.
3. **UI** — landing, signup/login, onboarding wizard, settings, gated `/dashboard`.
4. **Tests + cleanup** — auth e2e, remove the public business list, update CLAUDE.md.

## 10. Out of scope (v1)

Teams/invites, email verification, password reset, OAuth, rate-limiting, billing. None are blocked by this design.
