'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Brand } from '@/components/Brand'

/**
 * Route-segment error boundary. The App Router REQUIRES this to recover from a
 * runtime/render error in any page under app/ — without it the client router
 * shows "missing required error components, refreshing…" and loops.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface the real cause in the console for debugging.
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
      <Brand />
      <span className="pill mt-10 bg-[color-mix(in_srgb,var(--rose)_12%,transparent)] text-rose">
        <span className="h-1.5 w-1.5 rounded-full bg-rose" /> Something broke
      </span>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink">This line dropped.</h1>
      <p className="mt-3 max-w-md text-muted">
        We hit an unexpected error loading this page. Try again — if it keeps happening, the data service may be unreachable.
      </p>
      {error?.digest && <p className="mt-2 font-mono text-xs text-faint">ref: {error.digest}</p>}
      <div className="mt-8 flex items-center gap-2.5">
        <button onClick={reset} className="btn btn-primary">Try again</button>
        <Link href="/" className="btn">← Back to businesses</Link>
      </div>
    </main>
  )
}
