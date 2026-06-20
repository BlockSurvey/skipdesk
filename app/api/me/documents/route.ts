import { NextRequest, NextResponse } from 'next/server'
import { workerFetch } from '@/lib/auth-server'

/**
 * Dedicated multipart upload proxy. The generic JSON proxy (/api/proxy/...) reads
 * the body as text, which corrupts binary uploads — so document uploads get their
 * own handler that re-streams the parsed FormData to the worker with the session
 * bearer attached server-side (the token never touches client JS).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const form = await req.formData()
  const res = await workerFetch('/api/me/documents', { method: 'POST', body: form })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  })
}
