# SkipDesk

**Multi-tenant voice AI front-desk platform.** Every business gets a phone number (and a web voice widget) answered by an AI agent that picks up every call, answers questions, books appointments against real availability, and captures a lead when it can't help — so no caller is ever sent to voicemail again.

- 🔗 **Repository:** https://github.com/BlockSurvey/skipdesk
- 🚀 **Live demo:** https://skipdesk-gamma.vercel.app/
- 🛰️ **Live MCP server:** https://skip-desk-mcp.sweet-night-5b17.workers.dev

---

## The problem

Small businesses — clinics, salons, repair shops, agencies — lose real revenue to missed calls. Staff are with a customer, it's after hours, or the line is busy, and the caller hangs up and books with someone else. Hiring a receptionist is expensive; generic voicemail and IVR menus frustrate callers and capture nothing useful.

## What SkipDesk does

SkipDesk is the **backend + dashboard** behind an AI voice agent. A business signs up, completes a short onboarding (hours, services, FAQs, escalation contact), and connects the agent to a phone number or embeds a browser voice widget. From then on the agent:

1. **Heard** — answers every call instantly and responds to FAQs from the business's own knowledge base.
2. **Assisted** — checks real availability and books, reschedules, or cancels appointments live during the call.
3. **Guided** — when it can't resolve a request, it captures the caller's intent as a **lead** and escalates to staff.

Owners watch it all from a real-time dashboard: calls with AI summaries, a booking calendar, captured leads, and KPIs.

## Key features

- **Always-on AI front desk** over phone *and* a web voice widget (drop-in `<script>` embed or hosted `/talk/[slug]` page).
- **Real-time appointment booking** against business hours minus existing bookings (no double-booking, overlap/adjacency aware).
- **Lead capture & escalation** with caller dedup by phone number — a caller is stored once and reused across calls.
- **Knowledge-base RAG** — owners upload PDF/DOCX/TXT/MD; documents are chunked, embedded, and searched so the agent answers from the business's own content.
- **Owner dashboard** — KPIs, charts, calendar, caller feed with summaries, and lead management.
- **Strict multi-tenancy** — every query is tenant-scoped by `business_id` derived from the authenticated principal, never from request input.
- **Dual interface** — an MCP server (16 voice-agent tools) for AI clients *and* REST endpoints, both calling the identical data-layer functions.

## Tech stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS, Recharts |
| **Backend / API** | Cloudflare Workers, Model Context Protocol (`@modelcontextprotocol/sdk`) |
| **Database** | Cloudflare D1 (SQLite) with Drizzle ORM (`sqlite-core`, single source-of-truth schema) |
| **Storage & AI** | Cloudflare R2 (document blobs), Workers AI (`toMarkdown` + `bge-base-en-v1.5` embeddings) |
| **Voice platform** | Vapi (`@vapi-ai/web`) — shared assistant made multi-tenant at the edges |
| **Auth** | Email + password (PBKDF2-hashed), stateless ES256 JWT sessions (`jose`), httpOnly cookie |
| **Validation** | Zod |
| **Deploy** | Vercel (web app), Cloudflare Workers + D1 (API/MCP) |

## Architecture

```
Caller ──► Voice platform (Vapi)          Browser ──► Web voice widget
   │            │                                          │
   │     mid-call MCP tools / end-of-call webhook          │
   ▼            ▼                                          ▼
        Cloudflare Worker (MCP server + REST)  ◄── authenticated principal
                       │  (resolve business_id, tenant-scoped queries)
                       ▼
        Drizzle data layer ──► Cloudflare D1 (SQLite)   R2 (docs)   Workers AI (RAG)
                       ▲
        Owner ──► Next.js dashboard (session-gated)
```

One shared Drizzle data layer is used by three surfaces — the **MCP tools**, the **REST handlers**, and the **dashboard** — so there is no duplicated query logic and tenant isolation is enforced in exactly one place.

## Repository layout

```
app/            Next.js App Router — landing, signup/login, onboarding, dashboard, knowledge, settings, /talk/[slug]
components/     React UI — AuthForm, OnboardingWizard, dashboard panes, VapiWidget, Charts, Brand
lib/            Auth (server session), formatting, public JWT key
db/             Drizzle schema (single source of truth), enums, migrations, seed
workers/mcp/    Cloudflare Worker — MCP server, auth, onboarding, owner API, document RAG, widget config
public/         embed.js (widget loader), brand assets
docs/           System design specs, voice-agent build guide, MCP integration notes
tests/          End-to-end tests against the deployed MCP server
```

## Getting started

> Requires Node.js 18+, a Cloudflare account (Workers, D1, R2), and a Vapi account for voice.

```bash
# 1. Install
npm install

# 2. Configure Cloudflare creds in .env (gitignored)
#    CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_DATABASE_ID

# 3. Database — apply migrations + seed the demo tenant
npm run d1:migrate
npm run d1:seed

# 4. Deploy the MCP server / API worker
npm run mcp:deploy

# 5. Run the web app locally
npm run dev        # http://localhost:3000
```

Useful scripts: `npm run build` (production build), `npm run db:generate` (regenerate migration after editing `db/schema.ts`), `npm run db:studio` (browse D1), `npm run mcp:tail` (worker logs).

## Testing

End-to-end suites drive real caller workflows over the MCP protocol against the deployed server:

```bash
npm run test:e2e            # core workflows (45 assertions)
npm run test:e2e:identity   # caller identity / dedup edge cases
npm run test:e2e:auth       # accounts, sessions, tenant isolation
npm run test:e2e:knowledge  # knowledge-base RAG
```

## Design docs

- `docs/superpowers/specs/2026-06-19-skip-desk-design.md` — system design (data model, permissions, REST + MCP surface).
- `docs/FRONT_DESK_VOICE_AGENT_BUILD_GUIDE.md` — wiring the external voice platform.
- `docs/SKIPDESK_MCP_INTEGRATION.md` — MCP integration reference.

---

Built for the **Boomi AI 2026 hackathon**.
