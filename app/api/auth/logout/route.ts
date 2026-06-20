import { NextResponse } from 'next/server'
import { WORKER_BASE } from '@/lib/api'
import { SESSION_COOKIE, getSessionToken } from '@/lib/auth-server'

/** End the session on the worker and clear the cookie. */
export async function POST() {
  const token = getSessionToken()
  if (token) {
    await fetch(`${WORKER_BASE}/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => {})
  }
  const out = NextResponse.json({ ok: true })
  out.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return out
}
