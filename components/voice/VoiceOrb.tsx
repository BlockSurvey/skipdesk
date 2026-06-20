'use client'

import { useEffect, useRef } from 'react'

/**
 * The signature SkipDesk voice visualization — a living "voice orb".
 *
 * Purely presentational: it knows nothing about Vapi. It renders one of a few
 * conversation phases as colour + motion, and (optionally) scales a reactive
 * halo to a live audio amplitude. Both the real, Vapi-driven <LiveVoiceOrb> and
 * the scripted hero <CallConsole> render this same component, so the speaking /
 * your-turn language is identical everywhere.
 *
 * Phase → meaning (and colour):
 *   idle        neutral coral   — waiting to start
 *   connecting  coral, quick    — dialing in
 *   speaking    coral, rings out + halo reacts to REAL audio — the agent is talking
 *   listening   teal, ripple in — your turn; the agent is waiting for you
 *   thinking    amber, dots     — composing a reply
 *   ended       teal, check     — call finished
 *   error       rose            — something went wrong
 */
export type OrbPhase = 'idle' | 'connecting' | 'speaking' | 'listening' | 'thinking' | 'ended' | 'error'

const ORB_COLOR: Record<OrbPhase, string> = {
  idle: 'var(--brand)',
  connecting: 'var(--brand)',
  speaking: 'var(--brand)',
  listening: 'var(--teal)',
  thinking: 'var(--amber)',
  ended: 'var(--teal)',
  error: 'var(--rose)',
}

const SIZE_PX: Record<'xs' | 'sm' | 'md' | 'lg', number> = { xs: 64, sm: 96, md: 132, lg: 184 }

export function VoiceOrb({
  phase,
  getAmplitude,
  size = 'md',
  className = '',
}: {
  phase: OrbPhase
  /** Returns the current audio amplitude 0–1. Polled via rAF; no React re-render. */
  getAmplitude?: () => number
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  // Drive the reactive halo by writing --amp straight to the DOM each frame —
  // this keeps the ~50/s volume signal out of React's render path entirely.
  useEffect(() => {
    const el = rootRef.current
    if (!el || !getAmplitude) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let cur = 0
    const tick = () => {
      const target = getAmplitude() || 0
      cur += (target - cur) * 0.28 // smooth toward target
      el.style.setProperty('--amp', cur.toFixed(3))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getAmplitude])

  const px = SIZE_PX[size]

  return (
    <div
      ref={rootRef}
      className={`voice-orb ${className}`}
      data-phase={phase}
      style={{ width: px, height: px, ['--orb' as string]: ORB_COLOR[phase] }}
      aria-hidden
    >
      <span className="orb-ring" />
      <span className="orb-ring orb-ring-2" />
      <span className="orb-halo" />
      <span className="orb-breathe">
        <span className="orb-core">
          <OrbGlyph phase={phase} />
        </span>
      </span>
    </div>
  )
}

function OrbGlyph({ phase }: { phase: OrbPhase }) {
  if (phase === 'speaking') {
    return (
      <span className="orb-eq">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} style={{ animationDelay: `${i * 0.11}s` }} />
        ))}
      </span>
    )
  }
  if (phase === 'thinking' || phase === 'connecting') {
    return (
      <span className="orb-dots">
        {[0, 1, 2].map((i) => (
          <i key={i} style={{ animationDelay: `${i * 0.16}s` }} />
        ))}
      </span>
    )
  }
  if (phase === 'ended') return <IconCheck />
  if (phase === 'error') return <IconRetry />
  // idle + listening → microphone
  return <IconMic />
}

function IconMic() {
  return (
    <svg width="40%" height="40%" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
function IconCheck() {
  return (
    <svg width="42%" height="42%" viewBox="0 0 24 24" fill="none">
      <path d="M4 12.5l5 5L20 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconRetry() {
  return (
    <svg width="42%" height="42%" viewBox="0 0 24 24" fill="none">
      <path d="M20 11a8 8 0 10-2.3 5.6M20 5v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
