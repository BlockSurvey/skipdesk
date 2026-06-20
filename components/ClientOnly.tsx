'use client'

import { useEffect, useState } from 'react'

/**
 * Renders children only after mount. Used to wrap widgets whose output depends on
 * the current time, timezone, or locale (Intl/Date) — those legitimately differ
 * between the server render and the browser, which would otherwise trip React's
 * hydration check. The fallback holds the layout until the client takes over.
 */
export function ClientOnly({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return <>{mounted ? children : fallback}</>
}

/**
 * App-wide client gate (used in the root layout). The server emits only this
 * deterministic placeholder, so the page React hydrates is byte-identical on
 * server and client — no hydration mismatch is possible from our content, time,
 * timezone, locale, OR from browser extensions mutating the server HTML. Once
 * mounted, the real tree renders client-side. We intentionally don't SSR the app.
 */
export function NoSSR({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-hidden>
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-amber" />
      </div>
    )
  }
  return <>{children}</>
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-panel2 ${className}`} />
}
