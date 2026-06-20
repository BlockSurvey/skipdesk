'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { BrandMark } from './Brand'
import { Magnetic } from './Magnetic'

const LINKS = [
  { label: 'Live demo', href: '#try' },
  { label: 'How it works', href: '#how' },
  { label: 'Why SkipDesk', href: '#why' },
]

/**
 * Adaptive landing nav (Wise pattern): full-width and transparent over the
 * coral hero with an all-white logo + links, then transitions into a clean
 * frosted-white bar with the dark/coral logo once the user scrolls past the
 * hero crest. Fixed (overlays the hero); the hero carries top padding to clear it.
 *
 * Note: the background is set with an explicit rgba() — Tailwind's `/opacity`
 * modifier silently breaks on our CSS-variable colours (renders transparent),
 * which is what made earlier headers wash out over the coral.
 */
export function SiteNav() {
  const [solid, setSolid] = useState(false)

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 48)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-300 ${
        solid ? 'border-b border-line shadow-[0_1px_0_rgba(0,0,0,0.03)]' : 'border-b border-transparent'
      }`}
      style={{ backgroundColor: solid ? 'rgba(251,251,250,0.82)' : 'transparent' }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        {/* logo — all-white over the hero, dark + coral once solid */}
        <Link href="/" aria-label="SkipDesk home" className="group inline-flex items-center gap-2">
          <BrandMark
            className={`h-6 w-6 transition-[color,transform] duration-300 group-hover:scale-110 ${solid ? 'text-brand' : 'text-white'}`}
          />
          <span className={`font-brand text-lg font-bold tracking-tight transition-colors duration-300 ${solid ? 'text-ink' : 'text-white'}`}>
            Skip<span className={solid ? 'text-brand' : 'text-white'}>Desk</span>
          </span>
        </Link>

        {/* center menu links (desktop) */}
        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                solid ? 'text-muted hover:bg-panel2 hover:text-ink' : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`}
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* CTAs */}
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/login"
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              solid ? 'text-ink hover:bg-panel2' : 'text-white hover:bg-white/10'
            }`}
          >
            Sign in
          </Link>
          <Magnetic>
            <Link href="/signup" className={`btn rounded-full px-4 py-2 text-sm ${solid ? 'btn-brand' : 'btn-cream'}`}>
              Get started
            </Link>
          </Magnetic>
        </div>
      </div>
    </header>
  )
}
