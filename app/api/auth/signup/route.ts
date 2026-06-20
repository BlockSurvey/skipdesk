import { NextResponse } from 'next/server'
import { WORKER_BASE } from '@/lib/api'
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth-server'

/** Proxy signup to the worker; on success store the session token as an httpOnly cookie. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const res = await fetch(`${WORKER_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return NextResponse.json({ error: data.error ?? 'Sign up failed' }, { status: res.status })

  const out = NextResponse.json({ onboarded: data.onboarded ?? false })
  out.cookies.set(SESSION_COOKIE, data.session_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
  return out
}
