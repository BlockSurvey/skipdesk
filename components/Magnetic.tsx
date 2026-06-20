'use client'

import { useRef } from 'react'

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Magnetic hover: the wrapped element is gently pulled toward the cursor while
 * hovered, then springs back. Inline-block so it hugs its child (a button/link)
 * and the child keeps receiving pointer events. No-op under reduced-motion.
 */
export function Magnetic({
  children,
  className = '',
  strength = 0.35,
}: {
  children: React.ReactNode
  className?: string
  strength?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)

  function onMove(e: React.MouseEvent<HTMLSpanElement>) {
    const el = ref.current
    if (!el || reduced()) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left - r.width / 2) * strength
    const y = (e.clientY - r.top - r.height / 2) * strength
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
  }

  function reset() {
    const el = ref.current
    if (el) el.style.transform = ''
  }

  return (
    <span
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      className={`inline-block transition-transform duration-300 ease-out will-change-transform ${className}`}
    >
      {children}
    </span>
  )
}
