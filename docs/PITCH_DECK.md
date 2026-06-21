# SkipDesk — Pitch Deck

> **The AI front desk for small business.**
> Every customer *heard, assisted, and guided* — instantly — turning conversations into revenue.
>
> 🔗 Live demo: https://skipdesk-gamma.vercel.app/ · 🛰️ MCP: https://skip-desk-mcp.sweet-night-5b17.workers.dev

---

## 1 · Problem & who's affected

**A missed call is a missed customer.**

Small service businesses lose real revenue every time the phone rings and no one picks up — staff are with a customer, it's after hours, or the line is busy. Callers don't leave voicemail; they book with the next business.

- **Who's affected:** dental & skin clinics, salons & spas, medical practices, physio & chiro, fitness studios, veterinary, home/auto/professional services — anyone phone- and appointment-led.
- **Why it hurts:** hiring a receptionist is expensive; voicemail and IVR menus frustrate callers and capture *nothing useful*.
- **The cost:** every unanswered call is a booking handed to a competitor.

---

## 2 · Our insight — why now / why us

**Voice AI is finally good enough to *be* the front desk, not just route around it.**

- **Why now:** real-time, natural-sounding voice agents (Vapi) + capable reasoning models (Claude) + cheap edge compute (Cloudflare) make a 24/7 receptionist affordable for a one-location business — a first.
- **The insight:** the hard part isn't the voice — it's the *backend that makes the conversation trustworthy*: real availability, no double-booking, clean tenant-isolated data, nothing lost. That's what we built.
- **Why us:** we ship the **backend + dashboard** the voice platform calls into — strict multi-tenancy, dedup-by-phone identity, and a knowledge base — so the agent is grounded in each business's own truth, not a generic script.

---

## 3 · Solution demo — screens & flow

**One number (or a web widget) that answers like your best receptionist.**

Three guarantees on every call:

| Pillar | What the caller experiences |
|---|---|
| 🟠 **Heard** | Answered instantly, 24/7 — no voicemail, no hold. |
| 🟢 **Assisted** | Questions answered from the business's FAQs/docs; appointments booked, rescheduled, or cancelled against *live* availability — read back to confirm. |
| ⚪ **Guided** | When it can't close, it captures intent as a **lead** and escalates to staff. |

**Flow:** Sign up → 3-step onboarding (hours, services, FAQs, escalation) → point a phone number at it *or* embed the `<script>` web voice widget → live in minutes.

**Owner dashboard:** real-time calls with AI summaries · booking calendar · captured leads · KPIs & charts. *(Try the live agent on the landing page — no signup needed.)*

---

## 4 · Tech approach — models, data, architecture

**Edge-native, multi-tenant, single shared data layer.**

- **Models:** **Vapi** (`@vapi-ai/web`) for real-time voice — one shared assistant made multi-tenant at the edges; **Claude** for reasoning/tool use; **Workers AI** (`bge-base-en-v1.5`) for embeddings + `toMarkdown` document conversion.
- **Data:** **Cloudflare D1** (SQLite) via Drizzle — one source-of-truth schema; **R2** for document blobs; knowledge-base **RAG** (chunk → embed → cosine search) so answers come from the business's own content.
- **Interface:** an **MCP server** (16 voice-agent tools) *and* REST — both call the *identical* tenant-scoped query functions. No duplicated DB logic.
- **Multi-tenancy (non-negotiable):** every query is scoped by `business_id` derived from the **authenticated principal** (server-verified Vapi call record / API key / JWT) — **never** from caller input. No cross-tenant read path exists.
- **Auth:** PBKDF2-hashed passwords + stateless **ES256 JWT** sessions (worker signs, UI verifies locally).

```
Caller ─► Vapi ─┐                         Browser ─► Web voice widget ─┐
                │ mid-call MCP tools / webhook                         │
                ▼                                                      ▼
       Cloudflare Worker (MCP + REST) ─► Drizzle data layer ─► D1 · R2 · Workers AI
                ▲
       Owner ─► Next.js dashboard (session-gated)
```

---

## 5 · Value & GTM — who pays, how we reach them

**Who pays:** the business owner (clinic/salon/shop manager) — a per-location SaaS subscription, priced far below a part-time receptionist and justified by a single recovered booking.

**The value:**
- **24/7** answering · **0** calls to voicemail · **< 1 min** to set up · **1 number** for the whole front desk.
- ROI is concrete: every captured call that would have been lost is recoverable revenue.

**Go-to-market:**
1. **Self-serve** — sign up, onboard, and embed the widget with no sales call or credit card (try-before-you-buy live demo on the site).
2. **Vertical wedge** — start where calls = bookings = money: dental/aesthetic clinics and salons, then expand across the ICP.
3. **Land & expand** — single location → multi-location chains and franchises; partner with practice-management / booking tools for distribution.

---

## 6 · Next steps — roadmap & risks

**Roadmap**
- Per-`phone_number → business` mapping so inbound calls to the shared line route to the right tenant (closes the known demo-fallback gap).
- Live calendar sync (Google) — schema (`calendar_event_id`) already reserved.
- Per-business assistants + live KB RAG injection (today: shared assistant + FAQ summary).
- Scale-outs: vectors → Vectorize, inline ingest → Queue; teams/invites, billing, password reset, rate-limiting.

**Risks & mitigations**
- *Voice quality / latency* → built on a proven real-time platform; agent reads details back to confirm.
- *Hallucination on facts* → answers grounded in the business's own KB + structured tools; unresolved intents escalate rather than guess.
- *Data isolation* → application-layer tenancy enforced on every query, `business_id` from a server-verified principal only.
- *Adoption friction* → sub-minute self-serve onboarding and a no-signup live demo.

---

*SkipDesk — stop letting the phone cost you customers.*
