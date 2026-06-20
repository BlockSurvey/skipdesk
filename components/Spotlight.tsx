'use client'

import { useRef } from 'react'

/**
 * Pointer-tracking glow for dark colour bands. The `.spotlight` CSS draws a
 * radial highlight at (--mx, --my); we just update those vars on mouse move.
 * Touch devices never fire mousemove, so they get the clean static band.
 */
export function Spotlight({
  children,
  className = '',
  color = 'rgba(232, 70, 43, 0.20)',
}: {
  children: React.ReactNode
  className?: string
  color?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <div ref={ref} onMouseMove={onMove} className={`spotlight ${className}`} style={{ ['--spot' as string]: color }}>
      {children}
    </div>
  )
}
