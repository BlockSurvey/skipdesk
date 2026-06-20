/**
 * Advanced end-to-end tests — medium & complex scenarios against the DEPLOYED
 * Cloudflare MCP server. Focus: ADD / UPDATE / DELETE accuracy (verified by
 * re-fetching through a fresh query path), the booking overlap/adjacency matrix,
 * slot-freeing on reschedule/cancel, lead→appointment→call linkage, multi-tenant
 * isolation, scope enforcement, and auth rejection.
 *
 *   node tests/e2e-advanced.mjs [url]
 *
 * Requires the seeded second tenant (biz_test2) + keys sk_test2_full / sk_test2_readonly.
 * All test rows use +1999000xxxx phones / 'adv_*' ids and are cleaned up by the runner.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const URL_ = process.argv[2] ?? 'https://skip-desk-mcp.sweet-night-5b17.workers.dev/mcp'

let pass = 0, failCount = 0
const failures = []
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { failCount++; failures.push(`${name} ${detail}`); console.log(`  ✗ ${name} ${detail}`) }
}

async function makeClient(headers) {
  const c = new Client({ name: 'adv', version: '1.0.0' })
  await c.connect(new StreamableHTTPClientTransport(new global.URL(URL_), headers ? { requestInit: { headers } } : undefined))
  const call = async (name, args = {}) => {
    try {
      const res = await c.callTool({ name, arguments: args })
      const text = res.content?.[0]?.text ?? ''
      let data = null
      try { data = JSON.parse(text) } catch {}
      return { isError: !!res.isError, text, data }
    } catch (e) { return { isError: true, text: String(e?.message ?? e), threw: true } }
  }
  return { c, call }
}

const minutes = (n) => n * 60 * 1000
const addMs = (iso, ms) => new Date(new Date(iso).getTime() + ms).toISOString()

async function main() {
  const demo = await makeClient()
  console.log(`\nConnected (demo tenant): ${URL_}\n`)

  // ── A. Phone normalization equivalence ─────────────────────────────────────
  console.log('A. Phone normalization equivalence')
  const a1 = await demo.call('create_lead', { full_name: 'Norm Test', phone: '+1 (999) 000-3333', reason: 'normalize' })
  check('create_lead with formatted phone normalizes to E.164', a1.data?.lead?.phone === '+19990003333', a1.text)
  // Same digits, different punctuation → must resolve to the same E.164 and match.
  const a2 = await demo.call('lookup_caller', { phone: '+1.999.000.3333' })
  check('lookup finds caller via differently-formatted phone', a2.data?.found === true && a2.data?.name === 'Norm Test', a2.text)

  // ── B. ADD accuracy — re-fetch matches exactly ─────────────────────────────
  console.log('\nB. Add accuracy (re-fetch)')
  const b = await demo.call('create_lead', { full_name: 'Add Acc', phone: '+19990004444', reason: 'kidney consult', urgency: 'high', preferred_time: 'tomorrow morning' })
  const bId = b.data?.lead?.id
  const bGet = await demo.call('get_lead', { lead_id: bId })
  check('added lead persists name', bGet.data?.lead?.full_name === 'Add Acc')
  check('added lead persists reason', bGet.data?.lead?.reason === 'kidney consult')
  check('added lead persists urgency=high', bGet.data?.lead?.urgency === 'high')
  check('added lead persists preferred_time', bGet.data?.lead?.preferred_time === 'tomorrow morning')
  check('new lead defaults status=new', bGet.data?.lead?.status === 'new')

  // ── C. UPDATE accuracy — partial update never clobbers other fields ─────────
  console.log('\nC. Update accuracy (partial, no clobber)')
  const c0 = await demo.call('create_lead', { full_name: 'Upd Acc', phone: '+19990005555', reason: 'original reason', urgency: 'low' })
  const cId = c0.data?.lead?.id
  await demo.call('update_lead', { lead_id: cId, status: 'contacted' })
  const c1 = await demo.call('get_lead', { lead_id: cId })
  check('update status persisted', c1.data?.lead?.status === 'contacted')
  check('update did NOT clobber reason', c1.data?.lead?.reason === 'original reason')
  check('update did NOT clobber urgency', c1.data?.lead?.urgency === 'low')
  await demo.call('update_lead', { lead_id: cId, notes: 'left voicemail', urgency: 'high' })
  const c2 = await demo.call('get_lead', { lead_id: cId })
  check('second update sets notes', c2.data?.notes === 'left voicemail')
  check('second update sets urgency=high', c2.data?.lead?.urgency === 'high')
  check('second update preserved status=contacted', c2.data?.lead?.status === 'contacted')

  // ── D. Booking overlap / adjacency matrix ──────────────────────────────────
  console.log('\nD. Overlap / adjacency matrix')
  const av = await demo.call('check_availability', { duration_minutes: 30 })
  const S = av.data?.slots?.[0]
  check('availability returned a slot', !!S)
  const bookS = await demo.call('book_appointment', { customer_name: 'Slot S', customer_phone: '+19990006661', service: 'consult', starts_at: S.starts_at, ends_at: S.ends_at })
  const apptS = bookS.data?.appointment?.id
  check('book slot S ok', !bookS.isError, bookS.text)
  const overlap = await demo.call('book_appointment', { customer_name: 'Overlap', customer_phone: '+19990006669', service: 'x', starts_at: addMs(S.starts_at, minutes(15)), ends_at: addMs(S.starts_at, minutes(45)) })
  check('overlapping booking rejected', overlap.isError)
  const adj = await demo.call('book_appointment', { customer_name: 'Adjacent', customer_phone: '+19990006662', service: 'consult', starts_at: S.ends_at, ends_at: addMs(S.ends_at, minutes(30)) })
  check('adjacent (touching, non-overlapping) booking allowed', !adj.isError, adj.text)
  const apptAdj = adj.data?.appointment?.id
  const av2 = await demo.call('check_availability', { duration_minutes: 30 })
  check('booked slot S no longer offered', !av2.data?.slots?.some((x) => x.starts_at === S.starts_at))

  // ── E. Reschedule frees the old slot ───────────────────────────────────────
  console.log('\nE. Reschedule frees old slot')
  const T = av2.data?.slots?.[0]
  check('a later free slot T exists', !!T && T.starts_at !== S.starts_at)
  const resched = await demo.call('reschedule_appointment', { appointment_id: apptS, starts_at: T.starts_at, ends_at: T.ends_at })
  check('reschedule ok', !resched.isError, resched.text)
  const rGet = await demo.call('get_appointment', { appointment_id: apptS })
  check('reschedule persisted new time (re-fetch)', rGet.data?.appointment?.starts_at === T.starts_at)
  const rebookS = await demo.call('book_appointment', { customer_name: 'Rebook S', customer_phone: '+19990006663', service: 'consult', starts_at: S.starts_at, ends_at: S.ends_at })
  check('original slot S is bookable again after reschedule', !rebookS.isError, rebookS.text)

  // ── F. Cancel = soft-delete (row kept) + frees slot ────────────────────────
  console.log('\nF. Cancel (soft-delete) frees slot')
  const cancel = await demo.call('cancel_appointment', { appointment_id: apptS, reason: 'patient request' })
  check('cancel ok', !cancel.isError)
  const cGet = await demo.call('get_appointment', { appointment_id: apptS })
  check('cancelled row still retrievable (soft delete)', !cGet.isError && cGet.data?.appointment?.id === apptS)
  check('cancelled status persisted', cGet.data?.appointment?.status === 'cancelled')
  const av3 = await demo.call('check_availability', { duration_minutes: 30 })
  check('cancelled slot T is offered again', av3.data?.slots?.some((x) => x.starts_at === T.starts_at))

  // ── G. lead → appointment → call linkage ───────────────────────────────────
  console.log('\nG. Lead→appointment→call linkage')
  const gLead = await demo.call('create_lead', { full_name: 'Link Caller', phone: '+19990006670', reason: 'LINKTEST' })
  const gLeadId = gLead.data?.lead?.id
  const gAv = await demo.call('check_availability', { duration_minutes: 30 })
  const gSlot = gAv.data?.slots?.[0]
  const gAppt = await demo.call('book_appointment', { customer_name: 'Link Caller', customer_phone: '+19990006670', service: 'LINKTEST', starts_at: gSlot.starts_at, ends_at: gSlot.ends_at, lead_id: gLeadId })
  const gApptId = gAppt.data?.appointment?.id
  const gLog = await demo.call('log_call', { provider_call_id: 'adv_link_call', caller_number: '+19990006670', outcome: 'appointment_booked', summary: 'linked', lead_id: gLeadId, appointment_id: gApptId })
  check('log_call with lead+appointment links ok', !gLog.isError, gLog.text)
  // (DB-level verification of call_id backlinks is done by the runner script)

  // ── H. Idempotent log_call updates content, no duplicate ───────────────────
  console.log('\nH. Idempotent log_call')
  const h1 = await demo.call('log_call', { provider_call_id: 'adv_idem', caller_number: '+19990006680', outcome: 'info_provided', summary: 'v1' })
  const h2 = await demo.call('log_call', { provider_call_id: 'adv_idem', caller_number: '+19990006680', outcome: 'info_provided', summary: 'v2-updated', sentiment: 'positive' })
  check('same provider_call_id returns same call id', h1.data?.call?.id === h2.data?.call?.id)
  check('second log_call updated the summary', h2.data?.call?.summary === 'v2-updated')

  // ── I. Multi-tenant isolation (real API-key auth path) ─────────────────────
  console.log('\nI. Multi-tenant isolation')
  const t2 = await makeClient({ Authorization: 'Bearer sk_test2_full' })
  const t2info = await t2.call('get_business_info')
  check('API key resolves to tenant2 (auth path works)', t2info.data?.business?.name === 'Test Tenant Two', t2info.text)
  const demoInfo = await demo.call('get_business_info')
  check('demo tenant sees its own business (not tenant2)', demoInfo.data?.business?.name !== 'Test Tenant Two')

  await demo.call('create_lead', { full_name: 'Demo Only', phone: '+19990007777', reason: 'ISO_DEMO' })
  await t2.call('create_lead', { full_name: 'T2 Only', phone: '+19990008888', reason: 'ISO_T2' })
  const t2SeesDemo = await t2.call('lookup_caller', { phone: '+19990007777' })
  check('tenant2 CANNOT see demo lead', t2SeesDemo.data?.found === false)
  const demoSeesT2 = await demo.call('lookup_caller', { phone: '+19990008888' })
  check('demo CANNOT see tenant2 lead', demoSeesT2.data?.found === false)

  // ── J. Scope enforcement (read-only key) ───────────────────────────────────
  console.log('\nJ. Scope enforcement')
  const ro = await makeClient({ Authorization: 'Bearer sk_test2_readonly' })
  const roInfo = await ro.call('get_business_info')
  check('read-only key allowed info:read', !roInfo.isError)
  const roWrite = await ro.call('create_lead', { full_name: 'Nope', phone: '+19990009000', reason: 'x' })
  check('read-only key blocked from leads:write', roWrite.isError && /scope/i.test(roWrite.text))
  const roRead = await ro.call('list_leads', {})
  check('read-only key blocked from leads:read', roRead.isError && /scope/i.test(roRead.text))

  // ── K. Auth rejection + missing-row handling ───────────────────────────────
  console.log('\nK. Auth + missing-row handling')
  let badAuthRejected = false
  try {
    const bad = new Client({ name: 'bad', version: '1.0' })
    await bad.connect(new StreamableHTTPClientTransport(new global.URL(URL_), { requestInit: { headers: { Authorization: 'Bearer totally-invalid' } } }))
    await bad.close()
  } catch { badAuthRejected = true }
  check('invalid API key rejected (401 on connect)', badAuthRejected)
  const missGet = await demo.call('get_appointment', { appointment_id: 'does_not_exist' })
  check('get missing appointment errors cleanly', missGet.isError)
  const missUpd = await demo.call('update_lead', { lead_id: 'does_not_exist', status: 'closed' })
  check('update missing lead errors cleanly', missUpd.isError)
  const missCancel = await demo.call('cancel_appointment', { appointment_id: 'does_not_exist' })
  check('cancel missing appointment errors cleanly', missCancel.isError)

  console.log(`\n${'='.repeat(48)}`)
  console.log(`PASS ${pass}  FAIL ${failCount}`)
  if (failCount) { console.log('\nFailures:'); for (const f of failures) console.log('  - ' + f) }
  await demo.c.close(); await t2.c.close(); await ro.c.close()
  process.exit(failCount ? 1 : 0)
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
