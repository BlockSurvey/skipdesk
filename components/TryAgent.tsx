'use client'

import { useEffect, useState } from 'react'

import type { PublicWidgetConfig } from '@/lib/api'
import { VapiWidget } from './VapiWidget'

/** Pretty-print a US/E.164 number; fall back to the raw string. */
function fmtPhone(e164: string | null): string {
  if (!e164) return ''
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164)
  return m ? `+1 (${m[1]}) ${m[2]} ${m[3]}` : e164
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="btn btn-ghost shrink-0 text-xs"
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

/**
 * The landing-page conversion centerpiece: a visitor taps once to TALK to a live
 * SkipDesk agent, then sees the two channels they'll get for their own business —
 * an embeddable web widget and a phone number — side by side, ready to copy.
 */
export function TryAgent({ config }: { config: PublicWidgetConfig }) {
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  const ready = !!(config.vapiPublicKey && config.vapiAssistantId)
  const embed = origin ? `<script src="${origin}/embed.js" data-business="${config.slug}" async></script>` : ''
  const phonePretty = fmtPhone(config.phoneNumber)

  return (
    <div className="card overflow-hidden p-0 text-left">
      {/* window chrome */}
      <div className="flex items-center gap-1.5 border-b border-line bg-panel2 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-teal/60" />
        <span className="ml-3 font-mono text-[11px] text-faint">skip-desk · talk to a live agent</span>
      </div>

      <div className="grid md:grid-cols-[1fr_1.05fr]">
        {/* ── Talk now ─────────────────────────────────────────── */}
        <div className="flex flex-col items-center justify-center gap-5 px-6 py-10">
          <div className="text-center">
            <div className="text-[11px] font-medium uppercase tracking-wider text-faint">Live demo</div>
            <div className="mt-1 text-lg font-semibold text-ink">Talk to {config.businessName}</div>
            <p className="mt-1 text-sm text-muted">No signup. Tap, allow your mic, and just speak.</p>
          </div>

          {ready ? (
            <VapiWidget publicKey={config.vapiPublicKey!} assistantId={config.vapiAssistantId!} variableValues={config.variableValues} />
          ) : (
            <p className="text-sm text-muted">The live demo is warming up — try the phone number instead.</p>
          )}

          <div className="w-full max-w-xs space-y-1.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-faint">Try saying</div>
            {['“What are your hours?”', '“Can I book an appointment?”', '“Take my details for a callback.”'].map((s) => (
              <div key={s} className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-sm text-muted">{s}</div>
            ))}
          </div>
        </div>

        {/* ── Take it with you: two channels ───────────────────── */}
        <div className="space-y-4 border-t border-line bg-panel2/50 px-6 py-8 md:border-l md:border-t-0">
          <div>
            <div className="text-base font-semibold text-ink">Put this on your business</div>
            <p className="mt-1 text-sm text-muted">Same agent, two channels. Both work like your front desk.</p>
          </div>

          {/* Phone channel */}
          <div className="card p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--teal)_14%,transparent)] text-teal"><IconPhone /></span>
              <span className="text-sm font-semibold text-ink">Phone number</span>
              <span className="pill ml-auto bg-[color-mix(in_srgb,var(--teal)_12%,transparent)] text-teal"><span className="h-1.5 w-1.5 rounded-full bg-teal" /> live</span>
            </div>
            <div className="mt-3 font-mono text-xl tracking-tight text-ink">{phonePretty || '—'}</div>
            <div className="mt-3 flex gap-2">
              {config.phoneNumber && <a href={`tel:${config.phoneNumber}`} className="btn btn-primary flex-1 justify-center text-sm">Call now</a>}
              {config.phoneNumber && <CopyButton text={config.phoneNumber} />}
            </div>
          </div>

          {/* Widget channel */}
          <div className="card p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--amber)_16%,transparent)] text-amber"><IconWave /></span>
              <span className="text-sm font-semibold text-ink">Web widget</span>
              <span className="pill ml-auto bg-panel2 text-faint">1 line</span>
            </div>
            <p className="mt-2 text-xs text-faint">Paste once before <code className="font-mono">&lt;/body&gt;</code> on your site.</p>
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2">
              <code className="flex-1 break-all font-mono text-[11px] leading-relaxed text-muted">{embed || '…'}</code>
              {embed && <CopyButton text={embed} />}
            </div>
            {config.slug && origin && (
              <a href={`/talk/${config.slug}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-amber hover:underline">
                Preview the hosted page ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function IconPhone() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 3.5c0-.5.4-1 1-1h1.6c.4 0 .8.3.9.7l.6 2c.1.4 0 .8-.3 1l-1 .9a8 8 0 003.6 3.6l.9-1c.2-.3.6-.4 1-.3l2 .6c.4.1.7.5.7.9V12c0 .6-.5 1-1 1A9.5 9.5 0 013 3.5z" stroke="currentColor" strokeWidth="1.3" /></svg>
}
function IconWave() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 8h1.5M12.5 8H14M5 5v6M8 3v10M11 5v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
}
