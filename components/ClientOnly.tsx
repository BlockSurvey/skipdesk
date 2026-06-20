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

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-panel2 ${className}`} />
}
