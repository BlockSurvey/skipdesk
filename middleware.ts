import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE = 'sd_session'
const PROTECTED = ['/dashboard', '/settings', '/knowledge', '/widget', '/onboarding']
const AUTH_PAGES = ['/login', '/signup']

/**
 * Coarse edge gate: is a non-expired session cookie present? We decode the JWT's
 * `exp` (without verifying the signature) purely for fast UX routing. The
 * AUTHORITATIVE cryptographic verification (ES256 signature, with the public key)
 * happens in `getSession()` on the page (Node runtime) and again in the worker on
 * every data call — so a forged token passes this gate but is rejected there and
 * bounced to /login. Keeping jose out of the edge bundle keeps the build clean.
 */
function looksValid(token: string | undefined): boolean {
  if (!token) return false
  try {
    const part = token.split('.')[1]
    if (!part) return false
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof claims.exp === 'number' && claims.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

export function middleware(req: NextRequest) {
  const authed = looksValid(req.cookies.get(SESSION_COOKIE)?.value)
  const { pathname } = req.nextUrl

  if (PROTECTED.some((p) => pathname.startsWith(p)) && !authed) {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
  if (AUTH_PAGES.includes(pathname) && authed) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*', '/knowledge/:path*', '/widget/:path*', '/onboarding', '/login', '/signup'],
}
