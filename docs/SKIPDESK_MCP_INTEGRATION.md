# Connect your voice agent to Skip Desk (MCP)

Skip Desk exposes your AI front desk's backend as an **MCP server** (Model Context Protocol). Point any MCP-capable agent — **Vapi**, **Retell**, **Claude**, or your own — at one URL with your API key, and the agent can answer questions, book appointments, capture leads, and log calls directly into your Skip Desk dashboard.

---

## 1. What you need

| Item | Value |
|---|---|
| **MCP Server URL** | `https://skip-desk-mcp.sweet-night-5b17.workers.dev/mcp` |
| **Transport** | Streamable HTTP (recommended). Legacy SSE: `…/sse` |
| **Authorization** | `Authorization: Bearer <YOUR_API_KEY>` |
| **API key format** | `sk_live_…` (shown **once** during onboarding) |
| **Recommended timeout** | 20–30 seconds |

### Where do I get my API key?
- **Sign up** at the Skip Desk dashboard → complete onboarding → your key is shown **once** on the final screen. (You can also **rotate** it any time in **Settings**.)
- Keep it secret. Anyone with this key can read and write **your business's** data. It is scoped to your business only — it can never touch another tenant's data.

---

## 2. Configure in Vapi

In Vapi → **Tools → Create Tool → MCP**:

| Field | What to enter |
|---|---|
| **Tool Name** | `skip_desk` (any name) |
| **Description** | `Skip Desk front desk — answer info, check availability, book appointments, capture leads, log calls.` |
| **Server URL** | `https://skip-desk-mcp.sweet-night-5b17.workers.dev/mcp` |
| **Timeout** | `25` (seconds) |
| **Authorization** | Add a credential / custom header: **Header** `Authorization`, **Value** `Bearer sk_live_your_key_here` |

Save. Vapi will **auto-discover all 15 tools** — you don't list them manually. Then attach this tool to your Assistant.

> Tip: pair this with the ready-made system prompt in `docs/FRONT_DESK_SYSTEM_PROMPT.md` so the agent follows the right call flow (greet → confirm mobile → look up caller → check availability → book / capture lead → log call).

---

## 3. Configure in Claude (or any MCP client)

Add a **Streamable HTTP** MCP server:

```json
{
  "mcpServers": {
    "skip-desk": {
      "url": "https://skip-desk-mcp.sweet-night-5b17.workers.dev/mcp",
      "headers": { "Authorization": "Bearer sk_live_your_key_here" }
    }
  }
}
```

Without an `Authorization` header, the server falls back to a shared **demo** business (for testing only). Real businesses must send their key.

---

## 4. The 15 tools

Times are **ISO-8601 UTC** (e.g. `2026-06-20T09:30:00Z`). A caller is uniquely identified by **phone number**, not name. `?` = optional parameter.

### Information
| Tool | Purpose | Parameters |
|---|---|---|
| **get_business_info** | Look up hours, services, and FAQ answers to tell the caller. | `topic?` |
| **get_escalation_contact** | Who to transfer to / escalate to (by priority) when the caller needs a human. | — |

### Caller identity & leads
| Tool | Purpose | Parameters |
|---|---|---|
| **lookup_caller** | At the **start** of a call, check if the phone number is a known caller; returns their prior leads & appointments. `found=false` for a new caller. | `phone` |
| **create_lead** | Capture a caller's request when you can't fully serve them on the call. `escalate=true` flags urgent staff follow-up. | `full_name`, `phone`, `reason`, `email?`, `preferred_time?`, `urgency?`, `escalate?`, `call_id?` |
| **get_lead** | Fetch a single lead by id. | `lead_id` |
| **list_leads** | List/search leads for staff review. | `status?`, `urgency?`, `from?`, `to?`, `limit?` |
| **update_lead** | Update a lead's status/urgency/assignment/escalation/notes. | `lead_id`, `status?`, `urgency?`, `assigned_to?`, `escalated?`, `notes?` |

### Appointments
| Tool | Purpose | Parameters |
|---|---|---|
| **check_availability** | Find open slots vs. business hours & existing bookings **before** promising a time. Defaults to next 7 days, 30 min. | `date?`, `from?`, `to?`, `duration_minutes?`, `service?` |
| **book_appointment** | Book & confirm an appointment. **Always** `check_availability` first. Rejects past times, out-of-hours, and double-bookings. | `customer_name`, `customer_phone`, `service`, `starts_at`, `ends_at?`, `duration_minutes?`, `customer_email?`, `location?`, `lead_id?`, `call_id?`, `notes?` |
| **get_appointment** | Fetch a single appointment by id. | `appointment_id` |
| **list_appointments** | List by date range / status / caller phone (feeds the calendar). | `from?`, `to?`, `status?`, `phone?`, `limit?` |
| **reschedule_appointment** | Move an appointment to a new time (re-checks hours & conflicts). | `appointment_id`, `starts_at`, `ends_at?`, `duration_minutes?` |
| **cancel_appointment** | Cancel (soft — keeps the record). | `appointment_id`, `reason?` |

### Calls
| Tool | Purpose | Parameters |
|---|---|---|
| **log_call** | Record the call outcome when it ends (summary, intent, sentiment, duration, transcript). Idempotent on `provider_call_id`. Link to what it produced via `lead_id` / `appointment_id`. | `outcome`, `provider_call_id?`, `caller_number?`, `started_at?`, `ended_at?`, `duration_seconds?`, `summary?`, `intent?`, `sentiment?`, `transcript?`, `recording_url?`, `lead_id?`, `appointment_id?` |
| **list_calls** | List recent calls for staff review. | `outcome?`, `limit?` |

#### Allowed enum values
- **outcome:** `info_provided` · `appointment_booked` · `lead_captured` · `escalated` · `transferred` · `abandoned`
- **sentiment:** `positive` · `neutral` · `negative`
- **urgency:** `low` · `normal` · `high`
- **lead status:** `new` · `contacted` · `scheduled` · `closed`
- **appointment status:** `pending` · `confirmed` · `cancelled` · `completed` · `no_show`

---

## 5. How it stays clean & safe

- **Tenant isolation:** your API key resolves to **your** business; every read/write is scoped to it. No tool can read or write another business's data.
- **Scopes:** the key carries fine-grained scopes (`leads:read/write`, `appointments:read/write`, `calls:read/write`, `info:read`). Tools only run if the key has the matching scope.
- **Clean data:** phone numbers are normalized to E.164 (using your timezone's country code), times validated as ISO-UTC, and enums checked — so only well-formed rows land. A caller is **stored once and reused** by phone, so booking twice never creates a duplicate person.
- **Everything appears in your dashboard** in real time: calls, callers, appointments, and leads.

---

## 6. Quick test (curl)

```bash
# Replace with your key. Lists the available tools over MCP (JSON-RPC).
curl -s https://skip-desk-mcp.sweet-night-5b17.workers.dev/mcp \
  -H "Authorization: Bearer sk_live_your_key_here" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

You should get back the list of 15 tools. If you see `401`, your key is missing or invalid; if you see the demo data, you forgot the `Authorization` header.
