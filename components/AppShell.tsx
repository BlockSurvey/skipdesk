'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { BusinessSummary } from '@/lib/api'
import { Brand } from './Brand'
import { BusinessSwitcher } from './BusinessSwitcher'

type Section = { id: string; label: string; icon: React.ReactNode }

const NAV: Section[] = [
  { id: 'overview', label: 'Overview', icon: <IconGrid /> },
  { id: 'calendar', label: 'Calendar', icon: <IconCalendar /> },
  { id: 'callers', label: 'Callers', icon: <IconPhone /> },
  { id: 'leads', label: 'Leads', icon: <IconUsers /> },
]

export function AppShell({
  business,
  businesses,
  mcpUrl,
  children,
}: {
  business: { id: string; name: string; slug: string; timezone: string }
  businesses: BusinessSummary[]
  mcpUrl: string
  children: React.ReactNode
}) {
  const [active, setActive] = useState('overview')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    for (const s of NAV) {
      const el = document.getElementById(s.id)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [])

  const activeLabel = NAV.find((n) => n.id === active)?.label ?? 'Overview'

  return (
    <div className="min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-line bg-bg">
        <div className="px-4 pb-3 pt-5">
          <Brand small />
        </div>
        <div className="px-3">
          <Link href="/" className="mb-2 flex items-center gap-1.5 px-1 text-xs text-faint transition hover:text-ink">
            <span className="text-sm leading-none">‹</span> Back to businesses
          </Link>
          <BusinessSwitcher businesses={businesses} currentId={business.id} variant="sidebar" />
        </div>

        <nav className="mt-5 flex-1 px-3">
          <div className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-faint">This business</div>
          {NAV.map((s) => (
            <a key={s.id} href={`#${s.id}`} data-active={active === s.id} className="navi" onClick={() => setActive(s.id)}>
              <span className="text-faint">{s.icon}</span>
              {s.label}
            </a>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <button
            onClick={() => {
              navigator.clipboard.writeText(mcpUrl)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            className="navi w-full justify-between"
            title={mcpUrl}
          >
            <span className="flex items-center gap-2.5">
              <span className="text-faint"><IconLink /></span> MCP endpoint
            </span>
            <span className="text-[11px] text-faint">{copied ? 'copied' : 'copy'}</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-7 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-ink">{business.name}</span>
            <span className="text-faint">/</span>
            <span className="text-muted">{activeLabel}</span>
            <span className="pill ml-2 bg-[color-mix(in_srgb,var(--teal)_12%,transparent)] text-teal">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Active
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-xs text-faint sm:inline">{business.timezone}</span>
            <Link href="/register" className="btn btn-primary">+ New business</Link>
          </div>
        </header>
        <main className="px-7 py-7">{children}</main>
      </div>
    </div>
  )
}

function IconGrid() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /></svg>
}
function IconCalendar() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="M2 6h12M5 2v2M11 2v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
}
function IconPhone() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3.5c0-.5.4-1 1-1h1.6c.4 0 .8.3.9.7l.6 2c.1.4 0 .8-.3 1l-1 .9a8 8 0 003.6 3.6l.9-1c.2-.3.6-.4 1-.3l2 .6c.4.1.7.5.7.9V12c0 .6-.5 1-1 1A9.5 9.5 0 013 3.5z" stroke="currentColor" strokeWidth="1.3" /></svg>
}
function IconUsers() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5.5" r="2.3" stroke="currentColor" strokeWidth="1.3" /><path d="M2.5 13c0-2 1.6-3.3 3.5-3.3S9.5 11 9.5 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M10.5 9.8c1.6.1 3 1.3 3 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
}
function IconLink() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6.5 9.5l3-3M5.5 7L4 8.5a2.1 2.1 0 003 3L8.5 10M10.5 9L12 7.5a2.1 2.1 0 00-3-3L7.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
}
