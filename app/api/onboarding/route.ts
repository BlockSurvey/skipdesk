import { NextResponse } from 'next/server'
import { SESSION_COOKIE, SESSION_MAX_AGE, workerFetch } from '@/lib/auth-server'

/**
 * Proxy onboarding to the worker, then refresh the session cookie with the new
 * token the worker returns (claims now say onboarded=true) so the UI stops
 * redirecting to /onboarding.
 */
export async function POST(req: Request) {
  const body = await req.text()
  const res = await workerFetch('/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return NextResponse.json({ error: data.error ?? 'Onboarding failed' }, { status: res.status })

  const out = NextResponse.json({ business: data.business, api_key: data.api_key, mcp_url: data.mcp_url })
  if (data.session_token) {
    out.cookies.set(SESSION_COOKIE, data.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    })
  }
  return out
}
