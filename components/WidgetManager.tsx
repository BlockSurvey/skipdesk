'use client'

import { useEffect, useState } from 'react'

import type { WidgetInfo } from '@/lib/api'
import { VapiWidget } from './VapiWidget'

/** Pretty-print a US/E.164 number; fall back to the raw string. */
function fmtPhone(e164: string): string {
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
 * The "Assistants" surface. No on/off gating — the owner can always test their agent
 * and always copy both channels (phone + web widget) to put it anywhere.
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
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Assistants</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Your AI front desk on two channels — a phone number and a web widget. Test it right here, then copy
          either channel onto your site. Every call captures the caller’s details as a lead.
        </p>
      </div>

      {/* Test your agent — always available */}
      <div className="mt-6 rounded-xl border border-line bg-panel2 px-6 py-8">
        <div className="text-center">
          <div className="text-[11px] font-medium uppercase tracking-wider text-faint">Try it now</div>
          <div className="mt-1 text-lg font-semibold text-ink">Talk to your agent</div>
          <p className="mt-1 text-sm text-muted">Tap, allow your microphone, and have a real conversation.</p>
        </div>
        <div className="mt-5 flex justify-center">
          {canTest ? (
            <VapiWidget publicKey={initial!.publicKey!} assistantId={initial!.assistantId!} variableValues={variableValues} />
          ) : (
            <p className="text-sm text-muted">Voice isn’t connected on the server yet (missing Vapi keys).</p>
          )}
        </div>
      </div>

      {/* Two channels — always copyable */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {/* Phone */}
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--teal)_14%,transparent)] text-teal"><IconPhone /></span>
            <span className="text-sm font-semibold text-ink">Phone number</span>
            <span className="pill ml-auto bg-[color-mix(in_srgb,var(--teal)_12%,transparent)] text-teal"><span className="h-1.5 w-1.5 rounded-full bg-teal" /> live</span>
          </div>
          <p className="mt-2 text-xs text-faint">Customers call this and your agent answers. Forward your existing line here, or share it directly.</p>
          <div className="mt-3 font-mono text-xl tracking-tight text-ink">{phone ? fmtPhone(phone) : '—'}</div>
          {phone && (
            <div className="mt-3 flex gap-2">
              <a href={`tel:${phone}`} className="btn btn-primary flex-1 justify-center text-sm">Call now</a>
              <CopyButton text={phone} />
            </div>
          )}
        </div>

        {/* Web widget */}
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--amber)_16%,transparent)] text-amber"><IconWave /></span>
            <span className="text-sm font-semibold text-ink">Web widget</span>
            <span className="pill ml-auto bg-panel2 text-faint">1 line</span>
          </div>
          <p className="mt-2 text-xs text-faint">Paste once before <code className="font-mono">&lt;/body&gt;</code> on your website.</p>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2">
            <code className="flex-1 break-all font-mono text-[11px] leading-relaxed text-muted">{embed || '…'}</code>
            {embed && <CopyButton text={embed} />}
          </div>
          {hostedUrl && (
            <div className="mt-3 flex gap-2">
              <a href={hostedUrl} target="_blank" rel="noreferrer" className="btn btn-ghost flex-1 justify-center text-xs">Open hosted page ↗</a>
              <CopyButton text={hostedUrl} label="Copy link" />
            </div>
          )}
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
