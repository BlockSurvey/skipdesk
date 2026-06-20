'use client'

import { useEffect, useState } from 'react'

import type { WidgetInfo } from '@/lib/api'
import { LiveVoiceOrb } from './LiveVoiceOrb'

/** Pretty-print a US/E.164 number; fall back to the raw string. */
function fmtPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164)
  return m ? `+1 (${m[1]}) ${m[2]} ${m[3]}` : e164
}

function CopyButton({ text, label = 'Copy', tone = 'light' }: { text: string; label?: string; tone?: 'light' | 'dark' }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        tone === 'dark' ? 'bg-white/10 text-white hover:bg-white/15' : 'border border-line bg-panel text-ink hover:bg-panel2'
      }`}
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? 'Copied ✓' : label}
    </button>
  )
}

const HINTS = ['“What are your hours?”', '“Can I book an appointment?”', '“Take my details for a callback.”']

/**
 * The "Assistants" command stage. A single, full-height screen: an immersive dark
 * orb stage on the left where the owner talks to their live agent, and the two
 * deployable channels (phone + web widget) stacked on the right — no scrolling to
 * find them. Renders both in the dashboard Assistants tab and standalone /widget.
 */
export function WidgetManager({
  initial,
  variableValues,
}: {
  initial: WidgetInfo | null
  variableValues?: Record<string, string>
}) {
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  const slug = initial?.slug ?? ''
  const phone = initial?.phoneNumber ?? null
  const canTest = !!(initial?.publicKey && initial?.assistantId)
  const hostedUrl = origin && slug ? `${origin}/talk/${slug}` : ''
  const embed = origin && slug ? `<script src="${origin}/embed.js" data-business="${slug}" async></script>` : ''

  return (
    <div className="flex flex-col">
      {/* Compact header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Assistants</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Your AI front desk, live on two channels. Talk to it now, then drop either channel onto your site.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="pill bg-[color-mix(in_srgb,var(--teal)_12%,transparent)] text-teal">
            <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Phone live
          </span>
          <span className="pill bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Web ready
          </span>
        </div>
      </div>

      {/* The stage — fills the screen (capped on big monitors), and the left
          stage drives the row height so both columns line up. */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        {/* ── LEFT: immersive live-call stage ───────────────────────────── */}
        <div className="relative flex min-h-[30rem] flex-col items-center justify-center rounded-[28px] bg-ink px-6 py-10 text-center lg:min-h-[clamp(38rem,calc(100vh-13rem),44rem)]">
          {/* ambient atmosphere — clipped to the rounded box, so it can never
              clip the call content (which lives in the layer below). */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]" aria-hidden>
            <div className="aurora">
              <span style={{ width: '48%', height: '72%', right: '-10%', top: '-18%', background: '#ff7a4d', animationDelay: '0s' }} />
              <span style={{ width: '42%', height: '62%', left: '-12%', bottom: '-24%', background: '#e8462b', animationDelay: '-7s' }} />
            </div>
            <div
              className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(232,70,43,0.32), transparent 70%)', filter: 'blur(46px)' }}
            />
            <StagePulse />
          </div>

          <div className="relative z-10 flex w-full flex-col items-center">
            <span className="pill bg-white/10 text-white/80 backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
              </span>
              Try it now
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Talk to your agent</h2>
            <p className="mt-1.5 max-w-sm text-sm text-white/60">
              Tap, allow your microphone, and have a real conversation — exactly what your callers hear.
            </p>

            <div className="mt-7 w-full">
              {canTest ? (
                <LiveVoiceOrb
                  publicKey={initial!.publicKey!}
                  assistantId={initial!.assistantId!}
                  variableValues={variableValues}
                  size="hero"
                  tone="dark"
                  hints={HINTS}
                />
              ) : (
                <p className="text-sm text-white/60">Voice isn’t connected on the server yet (missing Vapi keys).</p>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: deployable channels ────────────────────────────────── */}
        <div className="flex min-h-0 flex-col gap-4">
          {/* Phone */}
          <div className="card flex flex-1 flex-col p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--teal)_14%,transparent)] text-teal"><IconPhone /></span>
              <span className="text-sm font-semibold text-ink">Phone number</span>
              <span className="pill ml-auto bg-[color-mix(in_srgb,var(--teal)_12%,transparent)] text-teal"><span className="h-1.5 w-1.5 rounded-full bg-teal" /> live</span>
            </div>
            <p className="mt-2 text-xs text-faint">Forward your existing line here, or share it directly. Your agent answers every call.</p>
            <div className="flex flex-1 flex-col justify-center py-4">
              <div className="font-mono text-3xl tracking-tight text-ink">{phone ? fmtPhone(phone) : '—'}</div>
              {phone && (
                <div className="mt-4 flex gap-2">
                  <a href={`tel:${phone}`} className="btn btn-primary flex-1 justify-center text-sm">Call now</a>
                  <CopyButton text={phone} />
                </div>
              )}
            </div>
          </div>

          {/* Web widget */}
          <div className="card flex flex-1 flex-col p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] text-brand"><IconWave /></span>
              <span className="text-sm font-semibold text-ink">Web widget</span>
              <span className="pill ml-auto bg-panel2 text-faint">1 line</span>
            </div>
            <p className="mt-2 text-xs text-faint">Paste once before <code className="font-mono">&lt;/body&gt;</code> on your website.</p>
            <div className="flex flex-1 flex-col justify-center gap-3 py-4">
              <div className="flex items-start gap-2 rounded-lg border border-line bg-panel2 px-3 py-2.5">
                <code className="flex-1 break-all font-mono text-[11px] leading-relaxed text-muted">{embed || '…'}</code>
                {embed && <CopyButton text={embed} />}
              </div>
              {hostedUrl && (
                <div className="flex gap-2">
                  <a href={hostedUrl} target="_blank" rel="noreferrer" className="btn flex-1 justify-center text-xs">Open hosted page ↗</a>
                  <CopyButton text={hostedUrl} label="Copy link" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** A slim equalizer ribbon faded into the bottom of the dark stage. */
function StagePulse() {
  const bars = Array.from({ length: 32 }, (_, i) => {
    const wave = Math.sin((i / 31) * Math.PI * 3)
    const h = 22 + (wave * 0.5 + 0.5) * 60
    return { x: i * 14 + 3, h, delay: (i % 7) * 0.18 }
  })
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-32 w-full opacity-[0.13]"
      viewBox="0 0 448 96"
      preserveAspectRatio="xMidYMax slice"
    >
      {bars.map((b) => (
        <rect key={b.x} className="pulse-bar" x={b.x} y={96 - b.h} width={8} height={b.h} rx={4} fill="#fff" style={{ animationDelay: `${b.delay}s` }} />
      ))}
    </svg>
  )
}

function IconPhone() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3.5c0-.5.4-1 1-1h1.6c.4 0 .8.3.9.7l.6 2c.1.4 0 .8-.3 1l-1 .9a8 8 0 003.6 3.6l.9-1c.2-.3.6-.4 1-.3l2 .6c.4.1.7.5.7.9V12c0 .6-.5 1-1 1A9.5 9.5 0 013 3.5z" stroke="currentColor" strokeWidth="1.3" /></svg>
}
function IconWave() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h1.5M12.5 8H14M5 5v6M8 3v10M11 5v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
}
