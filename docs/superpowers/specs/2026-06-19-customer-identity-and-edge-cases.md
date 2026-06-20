# Skip Desk — Customer Identity & Edge-Case Spec

**Date:** 2026-06-19
**Status:** Implemented + tested
**Context:** A voice agent captures callers. We must never lose a caller, never create
duplicates, and always reuse the right existing record. This spec defines the identity
model and the edge cases the data layer is designed to handle.

---

## 1. Identity model

**A caller is uniquely identified by `(business_id, normalized_phone)` — never by name.**

- Names collide (two "Raja"s). Phone is the stable key, so phone is **required** to
  create or book, and the agent must confirm it.
- The **`leads` table is the CRM contact record** (one per phone per business). A lead
  accumulates the caller's intent and links to their appointments and calls. There is no
  separate `customers` table — a lead *is* the customer record. Uniqueness is enforced in
  the application layer (`resolveContact`), not by a DB constraint, so existing data and
  multiple historical intents never cause a hard failure.
- Phones are normalized to **E.164** before any lookup or write, completing bare local
  numbers with the business's country code (derived from its timezone). So `9620146201`
  for an Asia/Kolkata business becomes `+919620146201` — and matches future lookups.

## 2. The single identity entry point

`resolveContact(db, businessId, { phone, name?, email?, callId? }) → { lead, created }`

- Finds the existing lead for that phone; if found, **returns it** (back-filling a missing
  name/email) — *the same existing record is reused*.
- If none, creates one. Every write path (capture a lead, book an appointment) goes through
  this, so a caller is stored exactly once and reused thereafter.

## 3. Edge cases (each is covered by a test)

| # | Scenario | Designed behavior |
|---|----------|-------------------|
| 1 | Two callers, **same name, different phone** | Two distinct contacts. Identity is phone. |
| 2 | **Same phone calls again** | Reuse the existing contact — no duplicate. |
| 3 | `create_lead` twice for one phone | One contact; intent (reason/urgency) updated, not duplicated. |
| 4 | Caller **books twice** | One contact, reused; two appointments both linked to it. |
| 5 | **Missing / unparseable phone** | Rejected — cannot create an identity without a phone. |
| 6 | **Phone format variants** (`9620146201`, `+91 96201 46201`, `0091…`) | Normalize to one E.164 → resolve to the same contact. |
| 7 | Same phone, **different name** on a later booking | Reuse the contact (phone wins); the appointment records the name given, the contact keeps its established name. |
| 8 | **Booking stores the caller** even with no prior lookup | `book_appointment` resolves-or-creates the contact and links it (store-if-not-found). |
| 9 | A captured **lead later books** | The same lead is reused and marked `scheduled`. |
| 10 | Booking **in the past / outside hours / conflicting** | Rejected with a clear, agent-friendly message; no contact orphaned. |
| 11 | **Bare local number** for a known-country business | Completed to E.164 with the country code (no malformed `+96…`). |

## 4. Agent responsibilities (system prompt)

The backend guarantees integrity, but the agent drives the flow:
1. Greet, then **ask for and confirm the mobile number** (the unique key) early.
2. Look the caller up by phone. If found, greet them by name and skip re-asking.
3. If not found, collect name + phone (+ email) — the backend stores them.
4. Qualify intent → check availability → book, or capture a lead + escalate.
5. Read times back in the caller's local timezone; log the call outcome at the end.

See `docs/FRONT_DESK_SYSTEM_PROMPT.md` for the ready-to-paste prompt.
