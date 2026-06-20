/**
 * Knowledge-base (document RAG) e2e against the deployed worker.
 *   node tests/e2e-knowledge.mjs [baseUrl]
 *
 * Flow: two throwaway owners → A uploads a document with a known fact → poll until
 * ingested → search_knowledge_base (MCP) retrieves it → B (a second tenant) cannot
 * see A's content → delete cleans it up. Accounts use kbtest+<ts>@example.test;
 * the uploaded doc is deleted by the test, and teardown purges any leftovers.
 */
const BASE = process.argv[2] ?? 'https://skip-desk-mcp.sweet-night-5b17.workers.dev'
const TS = process.env.KB_TEST_TS ?? String(Date.now())
let pass = 0, fail = 0
const fails = []
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; fails.push(`${n} ${d}`); console.log(`  ✗ ${n} ${d}`) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const DOC_NAME = `skipdesk-pricing-${TS}.txt`
// Build a document big enough to chunk into many pieces — this exercises the
// batched kb_chunks insert (D1 caps a statement at 100 bound params, so a single
// bulk insert of ~50 chunks would fail). The two facts below must survive chunking.
const FILLER = Array.from({ length: 60 }, (_, i) =>
  `Section ${i + 1}. Skip Desk handles inbound calls for clinics and answers routine ` +
  `questions about hours, directions, and services without keeping callers on hold. ` +
  `Every interaction is logged for the front desk to review later.`,
)
const DOC_TEXT = [
  'Skip Desk Premium Plan',
  '',
  'The Skip Desk Premium plan costs $4,200 per year. It includes 24/7 AI phone coverage,',
  'unlimited appointment booking, and priority escalation to your on-call staff.',
  '',
  'The Starter plan is $99 per month and covers business hours only (Monday to Friday).',
  '',
  'Refund policy: customers receive a full refund within 30 days of purchase, no questions asked.',
  '',
  ...FILLER.flatMap((p) => [p, '']),
].join('\n')

async function req(method, path, { token, body } = {}) {
  const headers = {}
  if (body) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let data = null
  try { data = await res.json() } catch {}
  return { status: res.status, data }
}

/** Raw JSON-RPC tools/call against the stateless /mcp endpoint with a business key. */
async function mcpCall(apiKey, name, args = {}) {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })
  const data = await res.json().catch(() => null)
  const text = data?.result?.content?.[0]?.text ?? ''
  let parsed = null
  try { parsed = JSON.parse(text) } catch {}
  return { isError: !!data?.result?.isError, text, parsed }
}

async function onboardOwner(label) {
  const email = `kbtest+${TS}${label}@example.test`
  const su = await req('POST', '/auth/signup', { body: { email, password: 'supersecret', name: `KB Owner ${label}` } })
  const token = su.data?.session_token
  const onb = await req('POST', '/onboarding', { token, body: { name: `KB Test ${label} ${TS}`, timezone: 'UTC' } })
  return { email, token, apiKey: onb.data?.api_key, businessId: onb.data?.business?.id }
}

async function main() {
  console.log(`\nKnowledge-base e2e → ${BASE}\n`)

  // A. Two tenants
  console.log('A. Provision two tenants')
  const A = await onboardOwner('a')
  const B = await onboardOwner('b')
  check('owner A onboarded (api key + business)', !!A.apiKey && !!A.businessId, `${A.apiKey?.slice(0, 8)} ${A.businessId}`)
  check('owner B onboarded', !!B.apiKey && !!B.businessId)
  check('two distinct businesses', A.businessId && B.businessId && A.businessId !== B.businessId)

  // B. Upload a document for A
  console.log('\nB. Upload a document (owner A)')
  const form = new FormData()
  form.append('file', new Blob([DOC_TEXT], { type: 'text/plain' }), DOC_NAME)
  const up = await fetch(`${BASE}/api/me/documents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${A.token}` },
    body: form,
  })
  const upBody = await up.json().catch(() => null)
  check('upload → 201', up.status === 201, up.status)
  const docId = upBody?.document?.id
  check('document row created', !!docId)
  check('initial status processing', upBody?.document?.status === 'processing', upBody?.document?.status)

  // C. Poll until ingested
  console.log('\nC. Wait for ingestion (toMarkdown → chunk → embed)')
  let doc = null
  for (let i = 0; i < 45; i++) {
    await sleep(2000)
    const r = await req('GET', `/api/me/documents/${docId}`, { token: A.token })
    doc = r.data?.document
    if (doc && (doc.status === 'ready' || doc.status === 'failed')) break
    process.stdout.write(`    …${doc?.status ?? '?'} (${(i + 1) * 2}s)\r`)
  }
  console.log('')
  check('document reached ready', doc?.status === 'ready', `status=${doc?.status} error=${doc?.error ?? ''}`)
  // >12 chunks forces the insert to span multiple D1 batches (100-param cap).
  check('many chunks produced (multi-batch insert)', (doc?.chunk_count ?? 0) > 12, `chunk_count=${doc?.chunk_count}`)

  // D. Agent search retrieves the fact (MCP, owner A's key)
  console.log('\nD. search_knowledge_base via MCP (owner A)')
  const s1 = await mcpCall(A.apiKey, 'search_knowledge_base', { query: 'How much does the Premium plan cost per year?' })
  check('search not an error', !s1.isError, s1.text.slice(0, 120))
  const hitsA = s1.parsed?.results ?? []
  check('at least one hit', hitsA.length > 0, `got ${hitsA.length}`)
  const top = hitsA[0]
  check('top hit cites the source document', top?.source === DOC_NAME, top?.source)
  check('top hit contains the price ($4,200)', /4,?200/.test(top?.text ?? ''), (top?.text ?? '').slice(0, 80))

  // E. Tenant isolation — B cannot see A's document
  console.log('\nE. Tenant isolation (owner B)')
  const s2 = await mcpCall(B.apiKey, 'search_knowledge_base', { query: 'How much does the Premium plan cost per year?' })
  const hitsB = s2.parsed?.results ?? []
  check("B's search returns nothing from A", hitsB.length === 0, `got ${hitsB.length}`)
  check("B is told the KB is empty", typeof s2.parsed?.note === 'string')

  // F. Owner-facing test-search endpoint works too
  console.log('\nF. Dashboard test-search endpoint')
  const ts = await req('POST', '/api/me/knowledge/search', { token: A.token, body: { query: 'what is the refund policy' } })
  check('test-search → 200', ts.status === 200, ts.status)
  check('refund passage retrieved', (ts.data?.hits ?? []).some((h) => /refund/i.test(h.text)), JSON.stringify(ts.data?.hits?.length))

  // G. Delete cleans up
  console.log('\nG. Delete document')
  const del = await req('DELETE', `/api/me/documents/${docId}`, { token: A.token })
  check('delete → 200', del.status === 200, del.status)
  const after = await req('GET', `/api/me/documents/${docId}`, { token: A.token })
  check('document gone (404)', after.status === 404, after.status)
  const s3 = await mcpCall(A.apiKey, 'search_knowledge_base', { query: 'How much does the Premium plan cost per year?' })
  check('search returns nothing after delete', (s3.parsed?.results ?? []).length === 0)

  console.log(`\n${'='.repeat(44)}\nPASS ${pass}  FAIL ${fail}`)
  if (fail) { console.log('\nFailures:'); for (const f of fails) console.log('  - ' + f) }
  console.log(`\nCleanup accounts: ${A.email}, ${B.email}`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error('FATAL', e); process.exit(1) })
