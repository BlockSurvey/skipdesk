'use client'

import { useEffect, useState } from 'react'

/** Thin coral reading-progress rail pinned to the very top of the page. */
export function ScrollProgress() {
  const [p, setP] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement
      const max = el.scrollHeight - el.clientHeight
      setP(max > 0 ? Math.min(1, el.scrollTop / max) : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-[3px]" aria-hidden>
      <div
        className="h-full bg-brand"
        style={{ width: `${p * 100}%`, boxShadow: '0 0 12px rgba(232,70,43,0.7)' }}
      />
    </div>
  )
}
