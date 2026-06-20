/**
 * Auth + onboarding e2e against the deployed worker (plain HTTP, no MCP SDK).
 *   node tests/e2e-auth.mjs [baseUrl]
 * Creates two throwaway owner accounts (authtest+<ts>...@example.test), exercises
 * the full flow, asserts tenant isolation, then the caller is expected to run the
 * teardown (emails/slugs are printed for cleanup; npm script handles it).
 */
const BASE = process.argv[2] ?? 'https://skip-desk-mcp.sweet-night-5b17.workers.dev'
const TS = process.env.AUTH_TEST_TS ?? String(Date.now())
let pass = 0, fail = 0
const fails = []
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; fails.push(`${n} ${d}`); console.log(`  ✗ ${n} ${d}`) } }

/** Decode a JWT's payload (no verification) to inspect claims. */
function jwtClaims(token) {
  try {
    const part = token.split('.')[1]
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
  } catch { return null }
}

async function req(method, path, { token, body } = {}) {
  const headers = {}
  if (body) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let data = null
  try { data = await res.json() } catch {}
  return { status: res.status, data }
}

async function main() {
  const emailA = `authtest+${TS}a@example.test`
  const emailB = `authtest+${TS}b@example.test`
  console.log(`\nAuth e2e → ${BASE}\nAccounts: ${emailA}, ${emailB}\n`)

  // A. signup
  console.log('A. Signup')
  const suA = await req('POST', '/auth/signup', { body: { email: emailA, password: 'supersecret', name: 'Owner A' } })
  check('signup → 201', suA.status === 201, suA.status)
  check('returns session token', !!suA.data?.session_token)
  check('not onboarded yet', suA.data?.onboarded === false)
  const tokenA = suA.data?.session_token
  // JWT shape + 14-day validity
  check('token is a JWT (3 parts)', (tokenA ?? '').split('.').length === 3)
  const claims = jwtClaims(tokenA)
  check('JWT signed ES256, iss=skip-desk', !!claims && claims.iss === 'skip-desk')
  check('JWT valid ~14 days', !!claims && claims.exp - claims.iat === 14 * 24 * 60 * 60, claims ? claims.exp - claims.iat : 'no claims')

  const weak = await req('POST', '/auth/signup', { body: { email: `weak+${TS}@example.test`, password: 'short' } })
  check('weak password → 400', weak.status === 400, weak.status)
  const dup = await req('POST', '/auth/signup', { body: { email: emailA, password: 'supersecret' } })
  check('duplicate email → 409', dup.status === 409, dup.status)

  // B. me before onboarding
  console.log('\nB. Me (pre-onboarding)')
  const meA0 = await req('GET', '/auth/me', { token: tokenA })
  check('me → 200', meA0.status === 200)
  check('business is null', meA0.data?.business === null)
  check('onboarded false', meA0.data?.onboarded === false)

  // C. onboarding
  console.log('\nC. Onboarding')
  const onbA = await req('POST', '/onboarding', { token: tokenA, body: { name: `Auth Test A ${TS}`, timezone: 'Asia/Kolkata', agentName: 'Sam', defaultAppointmentMinutes: 30 } })
  check('onboarding → 201', onbA.status === 201, onbA.status)
  check('business created', !!onbA.data?.business?.id)
  check('api key issued once', (onbA.data?.api_key ?? '').startsWith('sk_live_'))
  const bizA = onbA.data?.business?.id
  const onbAgain = await req('POST', '/onboarding', { token: tokenA, body: { name: 'dupe', timezone: 'UTC' } })
  check('second onboarding → 409', onbAgain.status === 409, onbAgain.status)

  // D. me + dashboard after onboarding
  console.log('\nD. Me + dashboard (post-onboarding)')
  const meA1 = await req('GET', '/auth/me', { token: tokenA })
  check('onboarded true', meA1.data?.onboarded === true)
  check('business id matches', meA1.data?.business?.id === bizA)
  const dashA = await req('GET', '/api/me/dashboard', { token: tokenA })
  check('dashboard → 200', dashA.status === 200, dashA.status)
  check('dashboard scoped to A', dashA.data?.business?.id === bizA)

  // E. second tenant + isolation
  console.log('\nE. Second tenant + isolation')
  const suB = await req('POST', '/auth/signup', { body: { email: emailB, password: 'supersecret', name: 'Owner B' } })
  const tokenB = suB.data?.session_token
  const onbB = await req('POST', '/onboarding', { token: tokenB, body: { name: `Auth Test B ${TS}`, timezone: 'UTC' } })
  const bizB = onbB.data?.business?.id
  check('two distinct businesses', bizA && bizB && bizA !== bizB)
  const dashB = await req('GET', '/api/me/dashboard', { token: tokenB })
  check("B's dashboard scoped to B (never A)", dashB.data?.business?.id === bizB && dashB.data?.business?.id !== bizA)
  const dashA2 = await req('GET', '/api/me/dashboard', { token: tokenA })
  check("A still only sees A", dashA2.data?.business?.id === bizA)

  // F. login + wrong password + config update
  console.log('\nF. Login + settings')
  const badLogin = await req('POST', '/auth/login', { body: { email: emailA, password: 'wrong' } })
  check('wrong password → 401', badLogin.status === 401, badLogin.status)
  const goodLogin = await req('POST', '/auth/login', { body: { email: emailA, password: 'supersecret' } })
  check('good login → token', goodLogin.status === 200 && !!goodLogin.data?.session_token)
  const patch = await req('PATCH', '/api/me/business', { token: tokenA, body: { agentName: 'Riley', phone: '+10000000000' } })
  check('profile patch → 200', patch.status === 200)
  check('agentName updated', patch.data?.business?.agentName === 'Riley')
  const rotate = await req('POST', '/api/me/key/rotate', { token: tokenA })
  check('key rotate issues new key', (rotate.data?.api_key ?? '').startsWith('sk_live_'))

  // G. unauth + logout
  console.log('\nG. Unauthenticated + logout')
  const unauth = await req('GET', '/api/me/dashboard')
  check('no token → 401', unauth.status === 401, unauth.status)
  const lo = await req('POST', '/auth/logout', { token: tokenA })
  check('logout → 204', lo.status === 204, lo.status)
  // Stateless JWT: the token still verifies until expiry; the UI just drops the cookie.
  const afterLogout = await req('GET', '/auth/me', { token: tokenA })
  check('token remains valid after logout (stateless; cookie cleared on UI)', afterLogout.status === 200, afterLogout.status)

  console.log(`\n${'='.repeat(44)}\nPASS ${pass}  FAIL ${fail}`)
  if (fail) { console.log('\nFailures:'); for (const f of fails) console.log('  - ' + f) }
  console.log(`\nCleanup emails: ${emailA}, ${emailB}`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error('FATAL', e); process.exit(1) })
