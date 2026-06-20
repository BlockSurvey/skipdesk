/**
 * Edge-case tests for caller IDENTITY & dedup (see the customer-identity spec).
 * Identity = (business, normalized phone). Names collide; phones don't.
 *   node tests/e2e-identity.mjs [url]
 * Demo tenant (Asia/Kolkata → +91). Test phones: bare 9999/8888… → cleaned up after.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const URL_ = process.argv[2] ?? 'https://skip-desk-mcp.sweet-night-5b17.workers.dev/mcp'
let pass = 0, failCount = 0
const fails = []
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { failCount++; fails.push(`${n} ${d}`); console.log(`  ✗ ${n} ${d}`) } }

const c = new Client({ name: 'identity', version: '1.0.0' })
async function call(name, args = {}) {
  try {
    const r = await c.callTool({ name, arguments: args })
    let data = null; try { data = JSON.parse(r.content?.[0]?.text ?? '') } catch {}
    return { isError: !!r.isError, data, text: r.content?.[0]?.text ?? '' }
  } catch (e) { return { isError: true, text: String(e?.message ?? e), threw: true } }
}

async function main() {
  await c.connect(new StreamableHTTPClientTransport(new global.URL(URL_)))
  console.log(`\nConnected ${URL_}\n`)

  // A. bare local number completes to E.164 with the business country code (+91)
  console.log('A. Local number → E.164 completion')
  const a = await call('create_lead', { full_name: 'CC Test', phone: '8888800001', reason: 'normalize' })
  check('bare 10-digit number becomes +91…', a.data?.lead?.phone === '+918888800001', a.data?.lead?.phone)
  check('first capture is created (not reused)', a.data?.created === true)

  // B. format variants resolve to the SAME contact
  console.log('\nB. Format variants → same contact')
  const b1 = await call('create_lead', { full_name: 'Var One', phone: '9999911111', reason: 'first' })
  const b2 = await call('create_lead', { full_name: 'Var One', phone: '+91 99999 11111', reason: 'second intent' })
  check('variant resolves to same contact id', b1.data?.lead?.id === b2.data?.lead?.id, `${b1.data?.lead?.id} vs ${b2.data?.lead?.id}`)
  check('second call is reused, not created', b2.data?.created === false && b2.data?.reused === true)
  check('intent updated on reuse', b2.data?.lead?.reason === 'second intent')
  const bLook = await call('lookup_caller', { phone: '919999911111' })
  check('lookup by yet another format finds them', bLook.data?.found === true && bLook.data?.name === 'Var One')

  // C. same NAME, different phone = two distinct contacts
  console.log('\nC. Same name, different phone → two contacts')
  const c1 = await call('create_lead', { full_name: 'Same Name', phone: '9999922221', reason: 'a' })
  const c2 = await call('create_lead', { full_name: 'Same Name', phone: '9999922222', reason: 'b' })
  check('same name + different phone → different contacts', c1.data?.lead?.id !== c2.data?.lead?.id)
  check('both are newly created', c1.data?.created === true && c2.data?.created === true)

  // D. repeat same phone → reuse, no duplicate
  console.log('\nD. Repeat same phone → reuse')
  const d1 = await call('create_lead', { full_name: 'Repeat', phone: '9999933331', reason: 'r1', urgency: 'low' })
  const d2 = await call('create_lead', { full_name: 'Repeat', phone: '9999933331', reason: 'r2', urgency: 'high' })
  check('same id reused', d1.data?.lead?.id === d2.data?.lead?.id && d2.data?.reused === true)
  const dGet = await call('get_lead', { lead_id: d1.data?.lead?.id })
  check('intent reflects latest (reason r2, urgency high)', dGet.data?.lead?.reason === 'r2' && dGet.data?.lead?.urgency === 'high')

  // E. booking STORES the caller if not found, links + marks scheduled, reuses on rebook
  console.log('\nE. Booking stores caller + reuse on rebook')
  const av = await call('check_availability', { duration_minutes: 30 })
  const s1 = av.data?.slots?.[0]
  const book1 = await call('book_appointment', { customer_name: 'Booker', customer_phone: '9999944441', service: 'consult', starts_at: s1.starts_at, ends_at: s1.ends_at })
  check('booking creates the contact (store-if-not-found)', book1.data?.customer?.new_contact === true, book1.text)
  const eLook = await call('lookup_caller', { phone: '9999944441' })
  check('caller now found after booking', eLook.data?.found === true)
  check('their lead is marked scheduled', eLook.data?.leads?.[0]?.status === 'scheduled')
  check('their appointment is listed', (eLook.data?.appointments?.length ?? 0) >= 1)
  const s2 = av.data?.slots?.find((x) => x.starts_at !== s1.starts_at)
  const book2 = await call('book_appointment', { customer_name: 'Booker', customer_phone: '+919999944441', service: 'follow-up', starts_at: s2.starts_at, ends_at: s2.ends_at })
  check('rebook reuses the same contact (no duplicate)', book2.data?.customer?.new_contact === false && book2.data?.customer?.contact_id === book1.data?.customer?.contact_id)
  const eLook2 = await call('lookup_caller', { phone: '9999944441' })
  check('still exactly one contact, two appointments', eLook2.data?.leads?.length === 1 && eLook2.data?.appointments?.length >= 2)

  // F. same phone, DIFFERENT name on booking → reuse contact, keep established name
  console.log('\nF. Same phone, different name → reuse, keep name')
  const f0 = await call('create_lead', { full_name: 'Alpha', phone: '9999955551', reason: 'x' })
  const s3 = av.data?.slots?.find((x) => x.starts_at !== s1.starts_at && x.starts_at !== s2.starts_at)
  const fBook = await call('book_appointment', { customer_name: 'Beta', customer_phone: '9999955551', service: 'consult', starts_at: s3.starts_at, ends_at: s3.ends_at })
  check('booking reuses Alpha’s contact', fBook.data?.customer?.contact_id === f0.data?.lead?.id && fBook.data?.customer?.new_contact === false)
  check('appointment records the name given (Beta)', fBook.data?.appointment?.customer_name === 'Beta')
  const fGet = await call('get_lead', { lead_id: f0.data?.lead?.id })
  check('contact keeps its established name (Alpha)', fGet.data?.lead?.full_name === 'Alpha')

  // G. missing / invalid phone rejected
  console.log('\nG. Invalid phone rejected')
  const g1 = await call('create_lead', { full_name: 'No Phone', phone: 'abc', reason: 'x' })
  check('non-numeric phone rejected', g1.isError)
  const g2 = await call('create_lead', { full_name: 'Short', phone: '123', reason: 'x' })
  check('too-short phone rejected', g2.isError)

  // H. booking guards still hold
  console.log('\nH. Booking guards')
  const past = await call('book_appointment', { customer_name: 'Past', customer_phone: '9999966661', service: 'x', starts_at: new Date(Date.now() - 86400000).toISOString() })
  check('past booking rejected', past.isError)
  const dbl = await call('book_appointment', { customer_name: 'Dup', customer_phone: '9999966662', service: 'x', starts_at: s1.starts_at, ends_at: s1.ends_at })
  check('double-booking a taken slot rejected', dbl.isError)

  console.log(`\n${'='.repeat(44)}\nPASS ${pass}  FAIL ${failCount}`)
  if (failCount) { console.log('\nFailures:'); for (const f of fails) console.log('  - ' + f) }
  await c.close()
  process.exit(failCount ? 1 : 0)
}
main().catch((e) => { console.error('FATAL', e); process.exit(1) })
