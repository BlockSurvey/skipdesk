'use client'

import { useRef } from 'react'

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Cursor-reactive 3D tilt. Tracks the pointer over the card and writes
 * --rx/--ry (rotation) and --mx/--my (sheen position) consumed by the `.tilt`
 * CSS. Respects reduced-motion (stays flat) and resets on leave.
 */
export function TiltCard({
  children,
  className = '',
  max = 7,
}: {
  children: React.ReactNode
  className?: string
  max?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el || reduced()) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--ry', `${(px * max).toFixed(2)}deg`)
    el.style.setProperty('--rx', `${(-py * max).toFixed(2)}deg`)
    el.style.setProperty('--mx', `${(px + 0.5) * 100}%`)
    el.style.setProperty('--my', `${(py + 0.5) * 100}%`)
  }

  function reset() {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={reset} className={`tilt ${className}`}>
      {children}
    </div>
  )
}
