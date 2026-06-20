'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * The hero centerpiece: a self-playing dramatization of one SkipDesk call.
 * It types out a real-feeling conversation — caller asks, the agent answers,
 * books an appointment, and captures a follow-up lead — while the three brand
 * pillars (Heard → Assisted → Guided) light up in sequence. It loops forever.
 *
 * This is illustrative motion, not the live product. The real, talk-to-it demo
 * is the <TryAgent> card further down the page.
 */

type Speaker = 'system' | 'caller' | 'agent'
type Line = { who: Speaker; text: string; pillar?: 0 | 1 | 2; tag?: string }

const SCRIPT: Line[] = [
  { who: 'system', text: 'Incoming call · +1 (415) 555‑0188', pillar: 0 },
  { who: 'caller', text: 'Hi — what time do you close today?' },
  { who: 'agent', text: "We're open till 6 PM today. Want me to book you in?" },
  { who: 'caller', text: 'Yes please, a cleaning — tomorrow morning?' },
  { who: 'agent', text: 'Done — tomorrow at 9:30 AM. You’re confirmed.', pillar: 1, tag: 'Appointment booked' },
  { who: 'caller', text: 'Oh, and do you do teeth whitening?' },
  { who: 'agent', text: 'I’ll have the team call you right back with details.', pillar: 2, tag: 'Lead captured' },
]

const PILLARS = [
  { label: 'Heard', color: 'var(--amber)' },
  { label: 'Assisted', color: 'var(--teal)' },
  { label: 'Guided', color: 'var(--steel)' },
]

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const on = () => setReduce(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduce
}

export function CallConsole() {
  const reduce = usePrefersReducedMotion()
  const [step, setStep] = useState(0)
  const [typed, setTyped] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Step machine: type the current line out, pause, advance; reset at the end.
  useEffect(() => {
    if (reduce) return
    const line = SCRIPT[step]

    if (!line) {
      const t = setTimeout(() => {
        setStep(0)
        setTyped(0)
      }, 2600)
      return () => clearTimeout(t)
    }

    if (typed < line.text.length) {
      const perChar = line.who === 'system' ? line.text.length : 1
      const speed = line.who === 'system' ? 420 : 22
      const t = setTimeout(() => setTyped((n) => Math.min(line.text.length, n + perChar)), speed)
      return () => clearTimeout(t)
    }

    const hold = line.who === 'agent' ? 1000 : line.who === 'system' ? 650 : 560
    const t = setTimeout(() => {
      setStep((s) => s + 1)
      setTyped(0)
    }, hold)
    return () => clearTimeout(t)
  }, [step, typed, reduce])

  // Keep the newest bubble in view as the transcript grows.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [step, typed])

  const done = reduce || step >= SCRIPT.length
  const current = SCRIPT[step]
  const speaking = !reduce && !!current && current.who === 'agent' && typed < current.text.length

  // Lines to render: all completed lines + the in-progress one (partial).
  const lines = done
    ? SCRIPT.map((l) => ({ ...l, shown: l.text, complete: true }))
    : [
        ...SCRIPT.slice(0, step).map((l) => ({ ...l, shown: l.text, complete: true })),
        ...(current ? [{ ...current, shown: current.text.slice(0, typed), complete: false }] : []),
      ]

  // A pillar is "lit" once the line that triggers it has fully typed.
  const litThrough = done
    ? 3
    : SCRIPT.slice(0, step).reduce((max, l) => (l.pillar !== undefined ? Math.max(max, l.pillar + 1) : max), 0)

  return (
    <div className="overflow-hidden rounded-[28px] border border-black/5 bg-white text-ink shadow-[0_40px_90px_-30px_rgba(20,10,5,0.5)]">
      {/* console header */}
      <div className="flex items-center gap-2.5 border-b border-line bg-panel2/70 px-5 py-3.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal" />
        </span>
        <span className="text-sm font-semibold text-ink">SkipDesk</span>
        <span className="font-mono text-[11px] text-faint">live call</span>
        <span className="ml-auto font-mono text-[11px] text-faint">00:0{Math.min(8, step + 1)}</span>
      </div>

      {/* transcript */}
      <div ref={scrollRef} className="fade-top h-[268px] space-y-3 overflow-hidden px-5 py-5">
        {lines.map((l, i) => (
          <Bubble key={i} who={l.who} tag={l.complete ? l.tag : undefined}>
            {l.shown}
            {!l.complete && <span className="caret" />}
          </Bubble>
        ))}
      </div>

      {/* waveform + status footer */}
      <div className="border-t border-line bg-panel2/40 px-5 py-4">
        <div className="flex items-center gap-3">
          <Waveform speaking={speaking} />
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-faint">
            {done ? 'call complete' : speaking ? 'agent speaking' : 'listening'}
          </span>
        </div>
        <div className="mt-3.5 flex items-center gap-2">
          {PILLARS.map((p, i) => {
            const lit = i < litThrough
            return (
              <div
                key={p.label}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-1.5 text-xs font-medium transition-all duration-500"
                style={{
                  borderColor: lit ? p.color : 'var(--line)',
                  color: lit ? p.color : 'var(--faint)',
                  background: lit ? `color-mix(in srgb, ${p.color} 10%, transparent)` : 'transparent',
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full transition-all duration-500"
                  style={{ background: lit ? p.color : 'var(--line-strong)', boxShadow: lit ? `0 0 10px ${p.color}` : 'none' }}
                />
                {p.label}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Bubble({ who, tag, children }: { who: Speaker; tag?: string; children: React.ReactNode }) {
  if (who === 'system') {
    return (
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 font-mono text-[11px] text-white/90">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
          {children}
        </span>
      </div>
    )
  }
  const isAgent = who === 'agent'
  return (
    <div className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug ${
          isAgent
            ? 'rounded-br-md bg-brand text-white'
            : 'rounded-bl-md border border-line bg-panel2 text-ink'
        }`}
      >
        {children}
      </div>
      {tag && (
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-semibold text-teal">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2l2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {tag}
        </span>
      )}
    </div>
  )
}

function Waveform({ speaking }: { speaking: boolean }) {
  // Deterministic bar heights (index-derived) so SSR/client agree.
  const bars = useMemo(
    () => Array.from({ length: 32 }, (_, i) => ({ h: 22 + Math.round((Math.sin(i * 1.7) * 0.5 + 0.5) * 78), d: (i % 8) * 0.07 })),
    [],
  )
  return (
    <div className="flex h-7 items-center gap-[3px]" aria-hidden>
      {bars.map((b, i) => (
        <span
          key={i}
          className="wave-bar w-[3px] rounded-full bg-brand"
          style={{
            height: `${b.h}%`,
            animationDelay: `${b.d}s`,
            animationPlayState: speaking ? 'running' : 'paused',
            opacity: speaking ? 0.85 : 0.3,
            transform: speaking ? undefined : 'scaleY(0.3)',
            transition: 'opacity .3s, transform .3s',
          }}
        />
      ))}
    </div>
  )
}
