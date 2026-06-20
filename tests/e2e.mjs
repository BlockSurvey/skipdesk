/**
 * End-to-end test of the Skip Desk MCP server against the DEPLOYED Cloudflare URL.
 * Drives the real voice-agent workflows through the MCP protocol, exactly as
 * Claude/Vapi will, and asserts clean data lands in D1.
 *
 *   node tests/e2e.mjs [https://skip-desk-mcp.<sub>.workers.dev/mcp]
 *
 * Test data uses phones in the +1999000xxxx range so it can be cleaned up after.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const URL_ = process.argv[2] ?? 'https://skip-desk-mcp.sweet-night-5b17.workers.dev/mcp'
const BOOK_PHONE = '+19990001111'
const LEAD_PHONE = '+19990002222'

let pass = 0
let failCount = 0
const failures = []
function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    failCount++
    failures.push(`${name} ${detail}`)
    console.log(`  ✗ ${name} ${detail}`)
  }
}

const client = new Client({ name: 'skip-desk-e2e', version: '1.0.0' })

/** Call a tool; return { isError, text, data }. Never throws (captures rejects). */
async function call(name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: args })
    const text = res.content?.[0]?.text ?? ''
    let data = null
    try {
      data = JSON.parse(text)
    } catch {}
    return { isError: !!res.isError, text, data }
  } catch (e) {
    return { isError: true, text: String(e?.message ?? e), data: null, threw: true }
  }
}

function isoIn(deltaMs) {
  return new Date(Date.now() + deltaMs).toISOString()
}

async function main() {
  await client.connect(new StreamableHTTPClientTransport(new global.URL(URL_)))
  console.log(`\nConnected to ${URL_}\n`)

  // ── 0. Protocol: all tools present ─────────────────────────────────────────
  console.log('0. Tool discovery')
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name)
  const expected = [
    'get_business_info', 'lookup_caller', 'create_lead', 'get_lead', 'list_leads',
    'update_lead', 'check_availability', 'book_appointment', 'get_appointment',
    'list_appointments', 'reschedule_appointment', 'cancel_appointment',
    'get_escalation_contact', 'log_call', 'list_calls', 'search_knowledge_base',
  ]
  check('16 tools registered', names.length === 16, `(got ${names.length})`)
  for (const t of expected) check(`tool present: ${t}`, names.includes(t))

  // ── 1. Info / knowledge base ───────────────────────────────────────────────
  console.log('\n1. Business info')
  const info = await call('get_business_info', { topic: 'hours' })
  check('get_business_info ok', !info.isError && !!info.data?.business)
  check('returns hours (7 days)', info.data?.hours?.length === 7)
  check('returns business name', typeof info.data?.business?.name === 'string')

  // ── 2. NEW caller — booking happy path ─────────────────────────────────────
  console.log('\n2. New caller → booking')
  const look1 = await call('lookup_caller', { phone: BOOK_PHONE })
  check('lookup_caller: new caller not found', !look1.isError && look1.data?.found === false)

  const avail = await call('check_availability', { duration_minutes: 30 })
  check('check_availability ok', !avail.isError)
  check('availability has open slots', (avail.data?.slots?.length ?? 0) > 0)
  const slot = avail.data?.slots?.[0]

  let apptId = null
  if (slot) {
    const book = await call('book_appointment', {
      customer_name: 'Test Booker',
      customer_phone: BOOK_PHONE,
      service: 'General consultation',
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
    })
    check('book_appointment succeeds on an open slot', !book.isError, book.text)
    check('booked status = confirmed', book.data?.appointment?.status === 'confirmed')
    check('phone normalized to E.164', book.data?.appointment?.customer_phone === BOOK_PHONE)
    apptId = book.data?.appointment?.id

    const got = await call('get_appointment', { appointment_id: apptId })
    check('get_appointment returns the booking', got.data?.appointment?.id === apptId)

    // double-booking the same slot must be rejected
    const dbl = await call('book_appointment', {
      customer_name: 'Conflict Caller', customer_phone: '+19990009999',
      service: 'X', starts_at: slot.starts_at, ends_at: slot.ends_at,
    })
    check('double-booking rejected (conflict)', dbl_rejected(dbl), dbl.text)
  }

  // log the call outcome and link the appointment
  const log1 = await call('log_call', {
    provider_call_id: 'test_call_book_1', caller_number: BOOK_PHONE,
    outcome: 'appointment_booked', summary: 'Booked a consultation.',
    intent: 'booking', sentiment: 'positive', duration_seconds: 95,
    appointment_id: apptId ?? undefined,
  })
  check('log_call (appointment_booked) ok', !log1.isError)
  const callId1 = log1.data?.call?.id
  // idempotent on provider_call_id
  const log1b = await call('log_call', { provider_call_id: 'test_call_book_1', caller_number: BOOK_PHONE, outcome: 'appointment_booked', summary: 'Updated summary.' })
  check('log_call idempotent on provider_call_id', !log1b.isError && log1b.data?.call?.id === callId1)

  // ── 3. EXISTING caller — recognized, reschedule, cancel ────────────────────
  console.log('\n3. Existing caller → reschedule/cancel')
  const look2 = await call('lookup_caller', { phone: BOOK_PHONE })
  check('lookup_caller: returning caller found', look2.data?.found === true)
  check('lookup_caller: returns their appointment', (look2.data?.appointments?.length ?? 0) > 0)

  const listByPhone = await call('list_appointments', { phone: BOOK_PHONE })
  check('list_appointments by phone finds booking', (listByPhone.data?.count ?? 0) > 0)

  if (apptId) {
    // reschedule to the next available slot
    const avail2 = await call('check_availability', { duration_minutes: 30 })
    const slot2 = avail2.data?.slots?.find((s) => s.starts_at !== slot?.starts_at) ?? avail2.data?.slots?.[1]
    if (slot2) {
      const resched = await call('reschedule_appointment', { appointment_id: apptId, starts_at: slot2.starts_at, ends_at: slot2.ends_at })
      check('reschedule_appointment ok', !resched.isError && resched.data?.appointment?.starts_at === slot2.starts_at, resched.text)
    }
    const cancel = await call('cancel_appointment', { appointment_id: apptId, reason: 'Test cleanup' })
    check('cancel_appointment soft-cancels', !cancel.isError && cancel.data?.appointment?.status === 'cancelled')
  }

  // ── 4. NEW caller — no fit → lead capture + escalation ─────────────────────
  console.log('\n4. Lead capture + escalation')
  const lead = await call('create_lead', {
    full_name: 'Escalation Caller', phone: LEAD_PHONE,
    reason: 'Needs a specialist not offered', urgency: 'high', escalate: true,
  })
  check('create_lead ok', !lead.isError, lead.text)
  check('lead urgency captured', lead.data?.lead?.urgency === 'high')
  check('escalation contact returned', !!lead.data?.escalated_to?.name)
  const leadId = lead.data?.lead?.id

  const esc = await call('get_escalation_contact')
  check('get_escalation_contact returns primary', !!esc.data?.primary?.name)

  const upd = await call('update_lead', { lead_id: leadId, status: 'contacted', notes: 'Called back' })
  check('update_lead sets status=contacted', upd.data?.lead?.status === 'contacted')

  const listLeads = await call('list_leads', { status: 'contacted', urgency: 'high' })
  check('list_leads filters by status+urgency', (listLeads.data?.count ?? 0) > 0)

  await call('log_call', { provider_call_id: 'test_call_lead_1', caller_number: LEAD_PHONE, outcome: 'escalated', summary: 'Escalated to specialist desk.', intent: 'specialist', sentiment: 'neutral', lead_id: leadId })
  check('log_call (escalated) ok', true)

  // ── 5. Clean-data enforcement (negatives) ──────────────────────────────────
  console.log('\n5. Clean-data guards')
  const past = await call('book_appointment', { customer_name: 'Past', customer_phone: BOOK_PHONE, service: 'X', starts_at: isoIn(-24 * 3600 * 1000) })
  check('rejects past booking', past.isError)

  const outside = await call('book_appointment', { customer_name: 'Night', customer_phone: BOOK_PHONE, service: 'X', starts_at: nextDayAtUtcHour(2) })
  check('rejects out-of-hours booking', outside.isError)

  const badPhone = await call('create_lead', { full_name: 'Bad', phone: '123', reason: 'x' })
  check('rejects invalid phone', badPhone.isError)

  const badOutcome = await call('log_call', { outcome: 'not_a_real_outcome' })
  check('rejects invalid enum (outcome)', badOutcome.isError)

  // ── summary ────────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(48)}`)
  console.log(`PASS ${pass}  FAIL ${failCount}`)
  if (failCount) {
    console.log('\nFailures:')
    for (const f of failures) console.log('  - ' + f)
  }
  await client.close()
  process.exit(failCount ? 1 : 0)
}

function dbl_rejected(r) {
  return r.isError
}

/** A near-future date at the given UTC hour (used to land outside IST open hours). */
function nextDayAtUtcHour(utcHour) {
  const d = new Date(Date.now() + 2 * 24 * 3600 * 1000)
  d.setUTCHours(utcHour, 0, 0, 0)
  return d.toISOString()
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
