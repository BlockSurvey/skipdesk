# Voice Widget (web) — multi-tenant lead capture via Vapi

**Date:** 2026-06-20
**Status:** Approved design → implementation
**Related:** `FRONT_DESK_VOICE_AGENT_BUILD_GUIDE.md` (phone path), `2026-06-19-skip-desk-design.md` (data model), `2026-06-20-knowledge-base-document-rag-design.md` (RAG)

## Goal

Give every business a **web voice widget** they can drop on their own site (or open as a
SkipDesk-hosted link) by passing their **business identifier**. The widget answers visitors
and **captures leads into that business's tenant** — working like their phone number, but on
the web. Plus a **clean hosted page to test the agent**.

A business already: signs up → onboards (name, hours, FAQs, escalation). This feature adds, on
top of that, a one-click **"Voice Widget"** they enable, copy, and embed.

## Architecture — one shared assistant, made multi-tenant at the edges

We reuse the owner's **single existing Vapi assistant** ("Front Desk Receptionist",
`a07fbcb4-5b92-4cb1-8606-b8a50af869ad`), whose system prompt is already templated with
`{{BUSINESS_NAME}}` / `{{AGENT_NAME}}`. Instead of provisioning a Vapi assistant per business,
we make the *one* assistant tenant-aware in two places:

- **Call start (browser):** inject the business's public context as Vapi `variableValues`
  (`BUSINESS_NAME`, `AGENT_NAME`, `GREETING`, `BUSINESS_HOURS`, `FAQ_SUMMARY`, `businessId`).
  The same assistant now greets as that business and knows its hours/FAQ — "dynamic per business".
- **Call end (server):** Vapi POSTs an `end-of-call-report` to our signed webhook. The worker
  reads `businessId` from the call's `variableValues`, verifies the shared secret, and writes a
  **lead + call** into *that* tenant using the existing `resolveContact` logic.

```
1. Visitor opens  app/talk/[slug]   OR   business embeds <script src=".../embed.js" data-business=ID>
2. Page/script → GET  WORKER/widget/config?slug=acme   (PUBLIC, returns only public-safe info)
       → { vapiPublicKey, vapiAssistantId, enabled, variableValues:{ BUSINESS_NAME, AGENT_NAME,
            GREETING, BUSINESS_HOURS, FAQ_SUMMARY, businessId } }
3. <vapi-widget public-key assistant-id mode="voice"
       assistant-overrides='{"variableValues":{...}}'>  → WebRTC voice call to the ONE assistant
4. Vapi records the whole call + runs a Structured Output extracting { fullName, phone, reason, ... }
5. Call ends → Vapi POSTs end-of-call-report → POST WORKER/api/v1/webhooks/vapi  (X-Vapi-Secret)
       → worker: businessId from variableValues → resolveContact + upsert call (idempotent on call id)
6. Lead + call appear on that business's /dashboard.
```

### Why this shape

- **Security holds the project's #1 constraint where it matters.** The browser only ever
  carries **non-secrets**: the Vapi *public* key (public by design) and the assistant id (it's in
  the dashboard URL). The lead is written **server-side in the webhook**, where `businessId`
  comes from the call payload and is passed to the existing tenant-scoped writers. **No
  browser-trusted read path exists** — `/widget/config` returns only public-facing info (name,
  hours, FAQ summary — exactly what the agent says aloud), never leads/calls/KB documents.
- **A stranger creating a lead is the product**, identical to the public phone number's threat
  model: anyone can call and leave their details. We expose *write-only* capture, no reads.
- **Maximum reuse:** no per-business Vapi objects, no new MCP tools, no SDK wrapper on the
  server. Reuses `resolveContact`, the `leads`/`calls` tables, and the whole dashboard.
- **Truly dynamic:** same assistant, different `variableValues` per call.

### Deliberate v1 scoping (upgrade paths, no migration)

- **Lead capture = post-call webhook only** (not a mid-call tool). Simpler, fully secure,
  reliable via Vapi Structured Outputs. The agent still *says* "someone will follow up" from its
  prompt. Mid-call live capture (a write-only custom tool) is a clean v2 add.
- **Business context = injected summary** (name, hours, FAQ summary as variables), **not** live
  knowledge-base RAG mid-call. Live KB needs a per-tenant-scoped read tool, which a single shared
  assistant can't do securely → that's the upgrade to a per-business assistant later.

## Data model change (one column)

`businesses.widget_enabled` — `INTEGER` boolean, default `false`. The owner flips it from the
dashboard. The assistant id + public key are **shared** (worker config), not per-business, so no
other columns are needed. `slug` (already unique) is the public widget identifier; `agent_name`
and `greeting` already exist.

Generate via `npm run db:generate`; apply with `npm run d1:migrate`. Never hand-edit migration SQL.

## Worker surface (`workers/mcp/`)

New file `src/widget.ts`:

- **`GET /widget/config?slug=<slug>`** (also accepts `?businessId=<id>`) — **public, CORS `*`**.
  Resolves the business; returns `{ businessId, slug, businessName, enabled, vapiPublicKey,
  vapiAssistantId, variableValues }`. `variableValues` is built from the tenant's public config:
  - `BUSINESS_NAME`, `AGENT_NAME` (defaults to "Sam"), `GREETING` (business greeting or a default),
  - `BUSINESS_HOURS` — a one-line human summary from `business_hours`,
  - `FAQ_SUMMARY` — top active FAQs flattened to `Q: … A: …` lines (bounded length),
  - `businessId` — carried into the call so the webhook can resolve the tenant.
  Returns `enabled:false` (still 200) if the owner hasn't enabled the widget, so the page can show
  a friendly "not enabled" state.

- **`POST /api/v1/webhooks/vapi`** — **signed** (`X-Vapi-Secret` must equal `VAPI_WEBHOOK_SECRET`;
  401 otherwise). Handles Vapi server messages; acts on `end-of-call-report` (ignores others with
  200). Steps:
  1. `businessId = message.call.assistantOverrides.variableValues.businessId`
     (fallback `message.call.metadata.businessId`). If absent/unknown business → 200 no-op (don't
     leak; don't error Vapi's retries).
  2. Upsert a `calls` row (idempotent on `message.call.id` as `provider_call_id`): transcript,
     summary (`message.analysis.summary`), recording url, started/ended, duration, `direction:'inbound'`,
     `outcome` = `lead_captured` when a lead is extracted else `info_provided`.
  3. If `message.analysis.structuredData` yields a phone + name: `resolveContact(db, businessId, …)`
     then update the lead's `reason`/`preferredTime`/`urgency`/`escalated` and link `callId`
     (mirrors `create_lead`). Phone normalized with the business's country code.
  Always returns 200 fast.

In `src/account.ts` (session-gated `/api/me/*`, business resolved from the session — never the URL):

- **`GET /api/me/widget`** → `{ enabled, slug, hostedPath:'/talk/<slug>', publicKey, assistantId }`.
- **`POST /api/me/widget/enable`** body `{ enabled:boolean }` → set `businesses.widget_enabled`.

`src/index.ts`: route `/widget/config` and `/api/v1/webhooks/vapi` **before** the bearer/tenant
resolution block (they're public / secret-authed, not API-key authed). Extend `Env` with
`VAPI_PUBLIC_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_WEBHOOK_SECRET`.

`wrangler.toml`: `VAPI_ASSISTANT_ID` as a `[vars]` (non-secret; it's in the dashboard URL).
`VAPI_PUBLIC_KEY` and `VAPI_WEBHOOK_SECRET` as **secrets** (`wrangler secret put`) — the public key
is returned to the browser by `/widget/config` on purpose, but kept out of git.

## Next.js surface (`app/`, `components/`)

- **`components/VapiWidget.tsx`** (client) — a mic button backed by the official **`@vapi-ai/web`**
  SDK; on click it `vapi.start(assistantId, { variableValues })` and tracks call state
  (connecting/active/speaking/error). Props: `publicKey`, `assistantId`, `variableValues`.
  **Why not `<vapi-widget>`:** the v0.1.1 web component nests `assistantId`/`assistantOverrides`
  under a transient `assistant` object, which Vapi's `/call/web` rejects 400
  ("assistant.property assistantId should not exist"). The SDK sends the correct top-level shape.
- **`app/talk/[slug]/page.tsx`** (public, no auth) — fetches `WORKER_BASE/widget/config?slug=` and
  renders a clean branded page: business name + greeting + the voice widget. This is both the
  **test page** and the **shareable link**. Handles `enabled:false` and unknown-slug states.
- **`app/widget/page.tsx`** (session-gated, mirrors `/knowledge`) + **`components/WidgetManager.tsx`**:
  enable/disable toggle, the hosted test link (`/talk/<slug>`), a copy-paste **embed snippet**,
  and a **live preview** (the same `VapiWidget`).
- **`public/embed.js`** — the loader a business pastes on their own site:
  `<script src="https://<skipdesk-app>/embed.js" data-business="<slug-or-id>" async></script>`.
  It reads `data-business`, fetches `WORKER_BASE/widget/config`, injects the Vapi widget script and
  a configured `<vapi-widget>`. Keeps context/businessId server-resolved (the business needn't know
  their variableValues).
- **`lib/api.ts`**: `getMyWidget()` (authed) + `getPublicWidgetConfig(slug)` (public fetch to
  `WORKER_BASE`). **`components/AppShell.tsx`**: add a "Voice Widget" nav link next to Knowledge.

## Vapi assistant wiring (applied via API with `VAPI_PRIVATE_KEY` — done, reproducible)

Rather than clicking the dashboard, the shared assistant (`a07fbcb4-…`) was configured with a
`PATCH https://api.vapi.ai/assistant/{id}` (Bearer `VAPI_PRIVATE_KEY`) that set: `server.url` =
the webhook + `server.secret` = `VAPI_WEBHOOK_SECRET`; `serverMessages: ["end-of-call-report"]`;
`analysisPlan.structuredDataPlan` = `{enabled, schema:{fullName,phone,reason,preferredTime,urgency,escalate}}`;
`firstMessage` = `{{GREETING}}`; and a "Business context" block appended to the system prompt that
references `{{BUSINESS_NAME}}/{{AGENT_NAME}}/{{BUSINESS_HOURS}}/{{TIMEZONE}}/{{FAQ_SUMMARY}}`. The
existing model + tool (`toolIds`) were preserved. (Re-run by GETting the assistant, merging, PATCHing.)

The equivalent manual steps, if ever needed:
1. Assistant → **Server / Messaging URL** = `https://skip-desk-mcp.sweet-night-5b17.workers.dev/api/v1/webhooks/vapi`,
   **Secret** = the value set as `VAPI_WEBHOOK_SECRET`.
2. Assistant → **Analysis / Structured Output** schema: `{ fullName, phone, reason, preferredTime?,
   urgency?(low|normal|high), escalate?(bool) }` so `end-of-call-report.analysis.structuredData` is populated.
3. System prompt: keep `{{BUSINESS_NAME}}`/`{{AGENT_NAME}}`; add references to `{{GREETING}}`,
   `{{BUSINESS_HOURS}}`, `{{FAQ_SUMMARY}}`. Use them to answer info questions and to capture a lead
   when it can't help.
4. Confirm the assistant's **public key** and **id** match the worker's `VAPI_PUBLIC_KEY` / `VAPI_ASSISTANT_ID`.

## Testing

- `GET /widget/config?slug=<demo>` returns the public payload with non-empty `variableValues` and
  the public key + assistant id; unknown slug → 404; disabled business → `enabled:false`.
- `POST /api/v1/webhooks/vapi` with a synthetic `end-of-call-report` (+ valid secret) creates a lead
  + call in the right tenant; wrong/missing secret → 401; unknown businessId → 200 no-op; replay of
  the same `call.id` updates (not duplicates) the call.
- Multi-tenant: a payload for business A never writes into business B.
- Next compiles (`npm run build`); `/talk/[slug]` renders the widget for a seeded business.

## Out of scope (v1)

Mid-call live lead tool; live KB RAG in the widget; per-business assistant provisioning via the Vapi
API (`VAPI_PRIVATE_KEY`); recording-consent UI; rate-limiting the public config endpoint.
