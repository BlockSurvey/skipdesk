import { NextRequest, NextResponse } from 'next/server'
import { workerFetch } from '@/lib/auth-server'

/**
 * Same-origin authed proxy to the worker. The browser calls /api/proxy/<worker-path>
 * (e.g. /api/proxy/onboarding, /api/proxy/api/me/business); we attach the session
 * token from the httpOnly cookie server-side and forward the request. This keeps the
 * token out of client JS and avoids cross-origin cookie problems.
 */
async function forward(req: NextRequest, path: string[]): Promise<NextResponse> {
  const workerPath = '/' + path.join('/') + (req.nextUrl.search || '')
  const init: RequestInit = { method: req.method }
  if (!['GET', 'HEAD'].includes(req.method)) {
    init.body = await req.text()
    init.headers = { 'content-type': req.headers.get('content-type') ?? 'application/json' }
  }
  const res = await workerFetch(workerPath, init)
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  })
}

type Ctx = { params: { path: string[] } }
export const GET = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params.path)
export const POST = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params.path)
export const PATCH = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params.path)
export const PUT = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params.path)
export const DELETE = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params.path)
