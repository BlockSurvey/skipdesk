'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Brand } from './Brand'

/** One selectable menu item; `node` is the content shown in the right pane. */
export type AppSection = { id: string; label: string; group: string; node: React.ReactNode }

const ICONS: Record<string, React.ReactNode> = {
  assistants: <IconBot />,
  overview: <IconGrid />,
  calendar: <IconCalendar />,
  callers: <IconPhone />,
  leads: <IconUsers />,
  knowledge: <IconDoc />,
  settings: <IconGear />,
}

/**
 * Master–detail shell: a persistent left menu, and a right pane that shows ONLY the
 * selected section. Switching is client-side (no navigation), so the whole product
 * lives on one clean page.
 */
export function AppShell({
  business,
  user,
  mcpUrl,
  sections,
}: {
  business: { id: string; name: string; slug: string; timezone: string }
  user: { email: string; name: string | null }
  mcpUrl: string
  sections: AppSection[]
}) {
  const router = useRouter()
  const [active, setActive] = useState(sections[0]?.id ?? '')
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false) // mobile drawer

  // Reflect the active tab in the URL hash (deep-linkable, shareable) and restore it
  // on load / when the hash changes (e.g. browser back/forward, a pasted link).
  useEffect(() => {
    const apply = () => {
      const h = decodeURIComponent(window.location.hash.replace('#', ''))
      if (h && sections.some((s) => s.id === h)) setActive(h)
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [sections])

  function select(id: string) {
    setActive(id)
    setNavOpen(false)
    if (typeof window !== 'undefined') history.replaceState(null, '', `#${id}`)
  }

  // Preserve group order as first encountered in the sections list.
  const groups: { name: string; items: AppSection[] }[] = []
  for (const s of sections) {
    let g = groups.find((x) => x.name === s.group)
    if (!g) groups.push((g = { name: s.group, items: [] }))
    g.items.push(s)
  }

  const activeSection = sections.find((s) => s.id === active) ?? sections[0]

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur-xl md:hidden">
        <button onClick={() => setNavOpen(true)} className="rounded-lg border border-line p-2 text-muted" aria-label="Open menu">
          <IconMenu />
        </button>
        <Brand small />
        <span className="ml-auto truncate text-sm text-muted">{activeSection?.label}</span>
      </div>

      {/* Backdrop (mobile, when drawer open) */}
      {navOpen && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setNavOpen(false)} aria-hidden />}

      {/* Sidebar — static on desktop, slide-in drawer on mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-bg transition-transform duration-200 md:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 pb-4 pt-5">
          <Brand small />
          <button onClick={() => setNavOpen(false)} className="rounded-lg p-1.5 text-faint md:hidden" aria-label="Close menu">✕</button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3">
          {groups.map((g, gi) => (
            <div key={g.name} className={gi === 0 ? '' : 'mt-4'}>
              <div className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-faint">{g.name}</div>
              {g.items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  data-active={active === s.id}
                  className="navi w-full"
                  onClick={() => select(s.id)}
                >
                  <span className="text-faint">{ICONS[s.id] ?? <IconGrid />}</span>
                  {s.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="space-y-2 border-t border-line p-3">
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

          {/* Account */}
          <div className="relative">
            <button onClick={() => setMenuOpen((o) => !o)} className="navi w-full justify-between">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-white">
                  {(user.name ?? user.email).slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate">{user.name ?? user.email}</span>
              </span>
              <span className="text-faint">⋯</span>
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-full overflow-hidden rounded-lg border border-line bg-panel shadow-lg">
                <div className="border-b border-line px-3 py-2 text-[11px] text-faint">{user.email}</div>
                <Link href="/" className="block px-3 py-2 text-sm text-muted transition hover:bg-panel2 hover:text-ink">Home</Link>
                <button onClick={logout} className="block w-full px-3 py-2 text-left text-sm text-rose transition hover:bg-panel2">Log out</button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="md:pl-64">
        <header className="sticky top-0 z-20 hidden h-14 items-center justify-between border-b border-line bg-bg/85 px-7 backdrop-blur-xl md:flex">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-ink">{business.name}</span>
            <span className="text-faint">/</span>
            <span className="text-muted">{activeSection?.label ?? ''}</span>
            <span className="pill ml-2 bg-[color-mix(in_srgb,var(--teal)_12%,transparent)] text-teal">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Active
            </span>
          </div>
          <span className="hidden font-mono text-xs text-faint sm:inline">{business.timezone}</span>
        </header>
        <main className="px-4 py-6 sm:px-7 sm:py-7">
          {/* key forces a clean remount per tab → each menu item is its own clean page */}
          <div key={active} className="animate-rise">
            {activeSection?.node}
          </div>
        </main>
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
function IconGear() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
}
function IconDoc() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 1.5h5L13 5v9a.5.5 0 01-.5.5h-9A.5.5 0 013 14V2a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.3" /><path d="M9 1.5V5h4M5.5 8.5h5M5.5 11h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
}
function IconBot() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="5.5" width="10" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.3" /><path d="M8 3v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><circle cx="8" cy="2.5" r="1" fill="currentColor" /><circle cx="6.2" cy="9" r="1" fill="currentColor" /><circle cx="9.8" cy="9" r="1" fill="currentColor" /></svg>
}
function IconMenu() {
  return <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
}
