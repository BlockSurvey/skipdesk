/**
 * End-to-end test of business onboarding: POST /register → unique key → the key
 * authenticates MCP calls and isolates that business's data.
 *   node tests/register.mjs [baseUrl]
 * Creates a tenant with slug "e2e-register-co" (cleaned up by the runner).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const BASE = (process.argv[2] ?? 'https://skip-desk-mcp.sweet-night-5b17.workers.dev').replace(/\/mcp$/, '')
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let pass = 0, failCount = 0
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { failCount++; console.log(`  ✗ ${n} ${d}`) } }

async function mcpClient(headers) {
  const c = new Client({ name: 'reg-test', version: '1.0.0' })
  await c.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), headers ? { requestInit: { headers } } : undefined))
  const call = async (name, args = {}) => {
    const res = await c.callTool({ name, arguments: args })
    let data = null; try { data = JSON.parse(res.content?.[0]?.text ?? '') } catch {}
    return { isError: !!res.isError, data, text: res.content?.[0]?.text ?? '' }
  }
  return { c, call }
}

async function main() {
  console.log(`\nRegistering against ${BASE}/register\n`)

  // 1. Register
  const res = await fetch(`${BASE}/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'E2E Register Co', timezone: 'Asia/Kolkata', escalation: { name: 'Owner', phone: '+910000000123' } }),
  })
  const reg = await res.json()
  check('register returns 201', res.status === 201, String(res.status))
  check('business id is a UUIDv4', UUID_RE.test(reg.business?.id ?? ''), reg.business?.id)
  check('api_key issued (sk_live_…)', typeof reg.api_key === 'string' && reg.api_key.startsWith('sk_live_'))
  check('mcp_url returned', typeof reg.mcp_url === 'string' && reg.mcp_url.endsWith('/mcp'))
  check('key granted full scopes', Array.isArray(reg.scopes) && reg.scopes.length === 7)

  // 2. Duplicate slug rejected
  const dup = await fetch(`${BASE}/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'E2E Register Co' }) })
  check('duplicate slug rejected (409)', dup.status === 409, String(dup.status))

  // 3. The key authenticates MCP and resolves to THIS business
  const biz = await mcpClient({ Authorization: `Bearer ${reg.api_key}` })
  const info = await biz.call('get_business_info')
  check('key resolves to the new business', info.data?.business?.name === 'E2E Register Co', info.text)
  check('default hours seeded (7 rows)', info.data?.hours?.length === 7)
  check('default Mon–Fri open', info.data?.hours?.find((h) => h.day === 'Mon')?.open === '09:00')

  const esc = await biz.call('get_escalation_contact')
  check('escalation contact from registration present', esc.data?.primary?.name === 'Owner')

  // 4. Writes with the key land in THIS business, isolated from the demo tenant
  const lead = await biz.call('create_lead', { full_name: 'Reg Lead', phone: '+19990123456', reason: 'onboarding test' })
  check('create_lead with issued key ok', !lead.isError, lead.text)

  const demo = await mcpClient() // no auth → demo tenant
  const demoSees = await demo.call('lookup_caller', { phone: '+19990123456' })
  check('demo tenant CANNOT see the new business lead (isolation)', demoSees.data?.found === false)
  const bizSees = await biz.call('lookup_caller', { phone: '+19990123456' })
  check('the new business CAN see its own lead', bizSees.data?.found === true)

  // 5. Invalid key rejected
  let rejected = false
  try { const bad = await mcpClient({ Authorization: 'Bearer sk_live_deadbeef' }); await bad.c.close() } catch { rejected = true }
  check('unknown key rejected', rejected)

  console.log(`\n${'='.repeat(40)}\nPASS ${pass}  FAIL ${failCount}`)
  await biz.c.close(); await demo.c.close()
  process.exit(failCount ? 1 : 0)
}
main().catch((e) => { console.error('FATAL', e); process.exit(1) })
