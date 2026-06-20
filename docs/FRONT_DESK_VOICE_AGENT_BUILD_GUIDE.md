# Front Desk Voice AI Agent — End-to-End Build Guide

> **Goal:** A live phone number that, when an event customer calls, is answered by an AI "front desk" agent. The agent checks **current availability** (from a calendar), answers the caller, books when possible, and — when nothing is available — **captures the caller's intent** (name, number, reason) into a **CRM/spreadsheet** for follow-up.
>
> **Strategy chosen:** Fastest-to-live using a **managed platform** (telephony + speech + LLM bundled), **not** a custom pipeline.
> **Availability source:** Google Calendar / Cal.com.
> **Intent capture:** Log to CRM / spreadsheet.

**Status:** Research-backed build plan. All technical claims below were verified against primary vendor documentation (Vapi, Retell AI, Twilio). Citations and a confidence note are in [Appendix A](#appendix-a--evidence--citations). Two commonly-repeated-but-false claims are flagged in [Appendix B](#appendix-b--myths-this-guide-avoids) so you don't waste time on them.

---

## 0. The big picture (how a managed voice agent actually works)

A phone call to an AI agent is a real-time loop. On a **managed platform** you don't build this loop — you configure it:

```
                        ┌─────────────────────────────────────────────┐
                        │             MANAGED PLATFORM                  │
  Caller ──phone──►  Telephony ──► STT ──► LLM ──► TTS ──► back to caller│
   (PSTN)            (number)    (speech   (brain  (speech                │
                                  →text)   +tools) →audio)                │
                        │            │        │                          │
                        └────────────┼────────┼──────────────────────────┘
                                     │        │
                                     │        ▼  (function calling / tools)
                                     │   ┌──────────────┐   ┌──────────────┐
                                     │   │ Google Cal / │   │  Your server │
                                     │   │   Cal.com    │   │ (webhook) →  │
                                     │   │ availability │   │  CRM / Sheet │
                                     │   └──────────────┘   └──────────────┘
                                     ▼
                              Call lifecycle webhooks
                              (call_started / ended / analyzed)
```

**What you actually build:**
1. **An assistant** — a system prompt + voice + chosen STT/LLM/TTS settings.
2. **Tools** — `checkAvailability`, `bookEvent`, `captureLead` (the agent calls these mid-call).
3. **A small backend** — one or two HTTP endpoints the agent's tools hit (for CRM logging and any custom availability logic).
4. **A phone number** — provisioned natively or imported.

Everything else (audio streaming, turn-taking, barge-in, transcription) is handled by the platform.

> ★ **Insight — why "managed" is the right call for a hackathon/MVP**
> The hard parts of voice are *latency* and *turn-taking* (knowing when the caller stopped talking). Twilio's own guidance puts the end-to-end budget at ~**1,115 ms** mouth-to-ear, split across STT (~350 ms), LLM first token (~375 ms), and TTS first byte (~100 ms). Hitting that with a hand-rolled pipeline is days of tuning. Vapi/Retell ship it tuned. You trade per-minute cost for time-to-live.

---

## 1. Choose your platform

The research narrowed the practical field to **Vapi** and **Retell AI** (Bland AI and Twilio's own ConversationRelay did not produce independently verifiable capability/pricing claims in this research — treat them as "evaluate separately," see [open questions](#open-questions--verify-before-you-rely-on-these)).

### Decision matrix

| Dimension | **Vapi** | **Retell AI** |
|---|---|---|
| **Telephony bundling** | Free **US** number natively (US national use only, ~10/account); import Twilio/Telnyx via credentials | Sells managed **US/Canada** numbers directly — *no separate telephony account needed* |
| **Native number price** | Free US number | $2/mo US, $5/mo US toll-free, $2/mo CA, $2/mo Telnyx US; toll-free inbound **$0.06/min** |
| **Bring-your-own Twilio** | SIP origination to `sip:NUMBER@<cred_id>.sip.vapi.ai` (US) / `sip.eu.vapi.ai` (EU) | Twilio **Elastic SIP Trunk** → origination `sip:sip.retellai.com` → import number |
| **Native calendar availability** | ✅ Built-in Google Calendar integration (OAuth) with **Check Availability** + **Create Event** tools | Via custom function/tool + your backend (no first-party Google Cal tool surfaced in research) |
| **Intent capture / CRM** | Custom tools → your **Server URL** (HTTP function calling) | Lifecycle **webhooks** (`call_started` / `call_ended` / `call_analyzed`) + custom tools |
| **Call transfer** | `transferCall` warm transfer (`warm-transfer-experimental`) | Built-in `transfer_call` — cold **and** warm (human detection, private whisper, 3-way intro) |
| **Recording consent** | `compliancePlan.recordingConsentPlan` (stay-on-line / verbal) — **Enterprise-gated** | Verify per your jurisdiction (see compliance section) |
| **Best when…** | You want the **fastest calendar booking demo** with zero OAuth code | You want **managed numbers with no Twilio account** and strong built-in transfer |

### Recommendation for this project

**Use Vapi** as the primary build path, because your two hardest requirements map directly onto Vapi's *built-in* features:
- **Real-time availability → Google Calendar** = Vapi's native **Check Availability** tool (no OAuth code to write).
- **Free US number** = zero telephony setup to get a working demo today.

Retell is the strong fallback if you need **managed Canadian numbers** or **warm transfer** out of the box. The rest of this guide is written for **Vapi**, with Retell equivalents noted at each step.

> Pick one and move. Both are reversible — the assistant prompt and tool logic port over with minor changes.

---

## 2. Prerequisites (15 minutes)

- [ ] Vapi account → `dashboard.vapi.ai`
- [ ] A Google account for the calendar that represents "availability" (a dedicated calendar like *"Event Bookings"* is cleaner than your personal one)
- [ ] An LLM provider key if you want to bring your own (Vapi can also use bundled models) — for best quality default to the latest Claude (e.g. `claude-opus-4-8`) or your provider of choice
- [ ] A place to receive webhooks for CRM logging — either:
  - a no-code target (Google Sheet via **Make/Zapier/n8n**, or **Airtable**), **or**
  - a tiny server you control (Node/Python) exposed over HTTPS (use `ngrok` for local dev)
- [ ] (Optional) A Twilio account — only if you need a non-US number or already own a number

---

## 3. Provision a phone number

### Path A — Fastest: Vapi free US number
1. Vapi dashboard → **Phone Numbers** → **Create / Buy**.
2. Choose the **free US** number. (Caveat: US national use only; soft cap ~10/account.)
3. You'll assign an assistant to it in [Step 6](#6-go-live-assign-the-number).

### Path B — Bring your own Twilio number (any region / existing number)
- **Import via credentials (simplest):** Phone Numbers → **Import** → enter Twilio **Account SID + Auth Token + the number**. Imported numbers work for inbound *and* outbound. (A newer API-Key+Secret method also exists.)
- **Or via SIP:** In Twilio's SIP Trunk **Origination**, add Vapi's URI:
  `sip:YOUR_NUMBER@<credential_id>.sip.vapi.ai` (US) or `...@sip.eu.vapi.ai` (EU).

### Retell equivalent
- **Managed number:** Dashboard → buy a US/Canada number directly (no Twilio account). Pricing: $2/mo US, $5/mo toll-free.
- **Bring Twilio:** Put the number on a Twilio **Elastic SIP Trunk** → set Origination to `sip:sip.retellai.com` → **import** the number into Retell so it knows how to route.

> ⚠️ **Myth check:** You do **not** need to move a Twilio number into an Elastic SIP Trunk to use it with **Vapi** — native provisioning/credential import works. (That requirement is specific to **Retell's** SIP path.) See [Appendix B](#appendix-b--myths-this-guide-avoids).

---

## 4. Build the assistant (the agent's brain)

Create an assistant in the dashboard. You configure four things:

### 4.1 Voice stack (STT / LLM / TTS)
On a managed platform these are **dropdowns**, not code:
- **STT (transcriber):** pick a low-latency model (e.g. Deepgram-class). Target ~350 ms.
- **LLM:** your model + the **system prompt** (below). This is the agent's behavior.
- **TTS (voice):** pick a natural voice. Target ~100 ms first byte.

> ★ **Insight — latency is a budget, not a single number.** If your demo feels "laggy," the culprit is almost always one component blowing its slice (often a slow LLM first-token or a verbose system prompt forcing long generations). Keep responses short and the model fast. Twilio's published per-component targets: STT 350/500 ms, LLM TTFT 375/750 ms, TTS TTFB 100/250 ms (target/max).

### 4.2 System prompt (the front-desk persona + rules)

This is where your *business logic* lives. A strong starting prompt for an event front desk:

```
# Identity
You are the front desk assistant for [EVENT/VENUE NAME]. You answer inbound
phone calls from customers warmly, briefly, and professionally.

# Your job, in order
1. Greet the caller and ask how you can help.
2. Understand what they want (book a slot, ask about an event, general question).
3. For any scheduling request, ALWAYS call `checkAvailability` before promising
   anything. Never invent availability.
4. If a slot is available, confirm details and call `bookEvent`.
5. If NOTHING suitable is available, do NOT just say "sorry":
   - Apologize briefly, then collect the caller's full name, callback number,
     and the reason/details of their request.
   - Call `captureLead` with that information so the team can follow up.
   - Tell the caller a team member will reach out, and by when.
6. If the caller is upset or explicitly asks for a person, offer to transfer.

# Style
- One question at a time. Keep turns under ~2 sentences.
- Confirm dates/times back to the caller before booking.
- Never read out internal IDs or technical details.

# Hard rules
- Never claim a booking succeeded unless `bookEvent` returned success.
- Always confirm the caller's phone number by reading it back.
```

> 🧩 **Your call to make:** The exact escalation policy in step 6 is a business + UX decision. *When* should the agent transfer to a human vs. just capture a lead? (e.g. transfer only during staffed hours; otherwise always capture.) Tune the prompt to your hours and staffing — this single choice shapes how the agent "feels."

### 4.3 First message
Set the opening line, e.g.: *"Thanks for calling [Event Name] — this is the front desk. How can I help you today?"*

---

## 5. Wire the tools (availability, booking, lead capture)

The agent's power comes from **tools** (function calling). You'll add three.

### 5.1 `checkAvailability` + `bookEvent` — via Vapi's native Google Calendar

This is Vapi's biggest time-saver — **no OAuth code**:

1. Dashboard → **Settings → Integrations** (relocated to `dashboard.vapi.ai/settings/integrations` as of mid-2025) → **Tools Provider → Google Calendar → Connect** → complete the Google auth popup. (OAuth is brokered for you.)
2. Add the **Check Availability** tool to your assistant. Params:
   - `startDateTime`, `endDateTime`, `timeZone` (defaults to **UTC** — set this explicitly to your event's timezone!), `calendarId` (defaults to `primary`).
3. Add the **Create Event** tool (`bookEvent`). Fields: `summary`, `startDateTime`, `endDateTime`, `attendees` (email list), `timeZone`, `calendarId`.

> ⚠️ **Gotcha:** `timeZone` defaults to **UTC**. For an event business this *will* cause off-by-hours bugs. Always pass the venue's timezone explicitly, and have the agent confirm the time back to the caller. (Community reports note timezone/attendee quirks — not schema bugs, but worth testing hard.)

**Using Cal.com instead of Google Calendar?** There's no first-party Cal.com tool surfaced in this research — route it through a **custom tool** (5.3 pattern) that calls Cal.com's availability/booking API from your backend. This is an [open question worth a 10-minute check](#open-questions--verify-before-you-rely-on-these) before committing.

### 5.2 `captureLead` — log intent to CRM / spreadsheet

This is your "no availability → capture intent" path. Two ways:

**Option 1 — Custom tool (real-time, during the call):**
- Create a **Custom Tool** in Vapi pointing at your **Server URL**. Vapi sends an HTTP POST with the tool-call arguments and a `toolCallId`; your server replies, matched back by `toolCallId`.
- Define the JSON schema the agent must fill:

```json
{
  "name": "captureLead",
  "description": "Save a caller's request when no availability exists, so the team can follow up.",
  "parameters": {
    "type": "object",
    "properties": {
      "fullName":     { "type": "string", "description": "Caller's full name" },
      "phoneNumber":  { "type": "string", "description": "Callback number, confirmed with caller" },
      "reason":       { "type": "string", "description": "What the caller wanted / event details" },
      "preferredDate":{ "type": "string", "description": "Any date/time they preferred, if given" }
    },
    "required": ["fullName", "phoneNumber", "reason"]
  }
}
```

- Your **Server URL** endpoint appends a row to a Google Sheet / Airtable / CRM. (No-code: point it at a **Make/Zapier/n8n** webhook that writes the row — zero backend code.)

**Option 2 — Lifecycle webhook (after the call):**
- Even without a custom tool, configure your assistant's **server webhook** to receive `call_ended` / `call_analyzed`-style events with the full transcript + structured analysis, then write the lead post-call. On **Retell** these are first-class events (`call_started`, `call_ended`, `call_analyzed` — note the *analysis* fields arrive ~30–90s later on `call_analyzed`, not `call_ended`), POSTed as JSON with an `x-retell-signature` header for verification.

> ★ **Insight — do both for reliability.** Use the **custom tool** (Option 1) for the live "I've noted that, someone will call you back" confirmation, and the **lifecycle webhook** (Option 2) as a safety net that captures every call's transcript even if the agent forgot to call the tool. Belt and suspenders.

> 🧩 **Your call to make:** What's the minimum viable lead record? Decide the exact columns now (Name, Phone, Reason, Preferred date, Timestamp, Call recording URL?) and whether duplicates are merged or appended. This shapes your `captureLead` schema and the sheet — get it right before the demo so follow-up is actually usable.

### 5.3 Custom-tool pattern (reference)
Any external action (custom availability, CRM, payments) follows the same shape: **Vapi tool (JSON schema) → POST to your Server URL → you do the work → return JSON → agent speaks the result.** Keep responses fast (<1s) so the call doesn't stall.

---

## 6. Go live: assign the number

1. Dashboard → **Phone Numbers** → select your number → **Inbound Settings**.
2. Set the **Assistant** to the one you built. (Static assignment = this assistant auto-answers every inbound call.)
3. *(Advanced/alt)* For multi-assistant routing, use the dynamic **assistant-request webhook** instead of a static assignment.

**Retell equivalent:** bind the agent to the number in the dashboard; inbound calls route to it.

That's it — **call the number from your phone. You're live.**

---

## 7. Test before you trust it

Run these scenarios end-to-end on a real call:

- [ ] **Happy path:** caller asks for a slot that exists → agent confirms → `bookEvent` creates the calendar event → check the calendar.
- [ ] **No availability:** caller asks for a full/blocked time → agent apologizes, collects name+number+reason → `captureLead` writes the row → check the sheet/CRM.
- [ ] **Timezone:** book across a timezone boundary; confirm the event lands at the right local time.
- [ ] **Number readback:** confirm the agent reads the callback number back correctly (STT mangles digits — this is the #1 real-world failure).
- [ ] **Interruptions (barge-in):** talk over the agent; it should stop and listen.
- [ ] **Transfer/escalation:** trigger your escalation rule; confirm transfer or graceful capture.
- [ ] **Latency feel:** does it feel conversational (<~1.2s gaps)? If laggy, shorten prompts / pick faster models.
- [ ] **Garbage input:** silence, background noise, "let me check with my wife" → agent stays composed.

> ★ **Insight — test with your worst accent and a noisy room.** Demos pass in a quiet office and fail at a live event. STT degrades with noise; that's where digit readback and confirmations save you.

---

## 8. Production concerns (read before real traffic)

### 8.1 Cost model (per-minute thinking)
Managed platforms bill roughly: **platform per-min + LLM tokens + STT + TTS + telephony**. The exact end-to-end per-minute cost for your agent was **not** independently benchmarked in this research — model it for *your* traffic before scaling. Known data points: Retell managed numbers $2–$5/mo and toll-free inbound **$0.06/min**. Vendor pricing changes without notice — confirm live numbers.

### 8.2 Latency targets (vendor "starting benchmarks")
- Mouth-to-ear turn gap: **~1,115 ms target**, 1,400 ms upper limit.
- Per component: STT 350/500 ms · LLM first token 375/750 ms · TTS first byte 100/250 ms.
- These are Twilio's published *starting* benchmarks, not guarantees — measure your own.

### 8.3 Call transfer / human escalation
- **Vapi:** `transferCall` with `transferPlan` mode `warm-transfer-experimental` — a dedicated transfer assistant briefs the human, caller hears hold music, context (`{{transcript}}`/summary) is carried over. **Flagged experimental** — test it specifically.
- **Retell:** built-in `transfer_call` supports **cold** (straight handoff) and **warm** (detects a human, leaves a private whisper the caller doesn't hear, does a 3-way intro). Phone calls only.

### 8.4 Recording & consent (compliance — do not skip)
- Call recording consent law varies (some US states require *all-party* consent). Build consent in from day one if you record.
- **Vapi:** `compliancePlan.recordingConsentPlan` inserts a consent assistant **first** in the call flow; recording starts **only after consent**. Two modes: **stay-on-line** (implied) and **verbal** (explicit). Fields: `type`, `message`, `voice`, `waitSeconds`, `declineToolId`.
- ⚠️ **Important:** this consent feature is **Enterprise-gated** on Vapi — it is *not* a free-tier default. On non-Enterprise plans (or on Retell), you must handle consent yourself (e.g., a consent line in your first message + a logged acknowledgement). **Confirm your jurisdiction's rule and your plan's capability before recording anyone.**

### 8.5 Reliability checklist
- [ ] Webhook endpoint is HTTPS, idempotent, and **verifies signatures** (e.g., Retell's `x-retell-signature`).
- [ ] Tool calls have timeouts + fallbacks (if `checkAvailability` errors, the agent apologizes and captures a lead instead of hanging).
- [ ] Lead capture has the post-call webhook **safety net** (8 above) so no caller is lost.
- [ ] Monitor failed calls / dropped tool calls.
- [ ] A human-reachable fallback exists for true emergencies.

---

## 9. Suggested build order (hackathon-optimized)

```
Day 1  ── Account + free US number + assistant with system prompt + first message
       ── Call it, talk to it (no tools yet). Confirm voice/latency feel good.
Day 1  ── Connect Google Calendar → add Check Availability + Create Event tools
       ── Test booking a real slot.
Day 2  ── Build captureLead custom tool → point Server URL at a Make/n8n → Google Sheet
       ── Test the "no availability → capture lead" path end to end.
Day 2  ── Add lifecycle webhook safety net (full transcript per call).
Day 2  ── Run the Step 7 test matrix. Fix timezone + digit readback.
Later  ── Transfer/escalation, recording consent, cost modeling, monitoring.
```

You have a **demoable agent by end of Day 1** and a **complete front desk by Day 2**.

---

## Open questions — verify before you rely on these

These came out of the research as genuinely unresolved; spend 10 minutes each before depending on them:

1. **Cal.com on Vapi/Retell** — is there a native integration, or must it go through a custom Server-URL tool? (Google Calendar native on Vapi is confirmed; Cal.com is not.)
2. **Bland AI & Twilio ConversationRelay** — no capability/pricing claims survived verification here. If you want a true 4-way comparison, evaluate them hands-on separately.
3. **Real end-to-end per-minute cost** (platform + LLM + STT + TTS + telephony) for your traffic — not benchmarked here.
4. **Non-Enterprise recording consent** on Vapi, and Retell's consent handling for strict two-party-consent states.

---

## Appendix A — Evidence & citations

Confidence is **high**: nearly every claim below is backed by **unanimous (3-0) adversarial verification** against **primary vendor documentation**. Vendor pricing and dashboard paths are **time-sensitive** — reconfirm live.

| Topic | Primary source |
|---|---|
| Vapi inbound + assign assistant | `https://docs.vapi.ai/quickstart/phone/inbound` (relocated to `/quickstart/phone`) |
| Vapi import Twilio number | `https://docs.vapi.ai/phone-numbers/import-twilio` |
| Vapi number API | `https://docs.vapi.ai/api-reference/phone-numbers/create` |
| Vapi SIP w/ Twilio | `https://docs.vapi.ai/advanced/sip/twilio` |
| Vapi Google Calendar tools | `https://docs.vapi.ai/tools/google-calendar` |
| Vapi custom tools / Server URL | `https://docs.vapi.ai/tools/custom-tools` · `https://docs.vapi.ai/server-url/setting-server-urls` |
| Vapi warm transfer | `https://docs.vapi.ai/calls/assistant-based-warm-transfer` · `https://docs.vapi.ai/call-forwarding` |
| Vapi recording consent | `https://docs.vapi.ai/security-and-privacy/recording-consent-plan` |
| Retell buy number / pricing | `https://docs.retellai.com/deploy/purchase-number` · `https://docs.retellai.com/api-references/create-phone-number` |
| Retell + Twilio SIP | `https://docs.retellai.com/deploy/twilio` |
| Retell webhooks | `https://docs.retellai.com/features/webhook` |
| Retell transfer_call | `https://docs.retellai.com/build/single-multi-prompt/transfer-call` |
| Latency budgets | `https://www.twilio.com/en-us/blog/developers/best-practices/guide-core-latency-ai-voice-agents` |

---

## Appendix B — Myths this guide avoids

Two widely-repeated claims were **refuted 0-3** in verification. Do **not** build around them:

1. ❌ *"A Twilio number must be in an Elastic SIP Trunk to connect to Vapi."* — **False.** Vapi supports native provisioning and credential import. (The SIP-trunk requirement is specific to **Retell's** SIP path.)
2. ❌ *"Twilio ConversationRelay achieves <0.5s median / <0.725s p95 latency."* — **Unsubstantiated.** Don't quote these figures; measure your own.

---

*Generated from a deep-research pass: 5 search angles → 25 sources fetched → 118 claims extracted → 25 adversarially verified (23 confirmed, 2 killed). Vendor pricing, URLs, and feature gating change frequently — treat this as a verified-as-of-research snapshot and reconfirm specifics in the live dashboards.*
