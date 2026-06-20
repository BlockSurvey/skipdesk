'use client'

import { useVapiCall } from './voice/useVapiCall'
import { VoiceOrb, type OrbPhase } from './voice/VoiceOrb'

/**
 * The real, talk-to-it voice experience: the signature voice orb wired to a live
 * Vapi call, with a clear status line, a live caption, and call controls. Used on
 * the landing demo (#try), the public /talk/[slug] page, and the dashboard's
 * "Talk to your agent" — one component, so the experience is identical everywhere.
 */

const STATUS: Record<OrbPhase, string> = {
  idle: 'Tap to talk',
  connecting: 'Connecting…',
  thinking: 'Thinking…',
  speaking: 'SkipDesk is speaking',
  listening: 'Your turn — listening',
  ended: 'Call ended',
  error: 'Tap to retry',
}

const SIZE_MAP = { hero: 'lg', full: 'lg', panel: 'md' } as const

export function LiveVoiceOrb({
  publicKey,
  assistantId,
  variableValues,
  size = 'full',
  hints,
  tone = 'light',
}: {
  publicKey: string
  assistantId: string
  variableValues?: Record<string, string>
  size?: 'hero' | 'full' | 'panel'
  /** Optional "Try saying…" prompts, shown only before the call starts. */
  hints?: string[]
  /** 'dark' adapts text/buttons for an immersive dark stage. */
  tone?: 'light' | 'dark'
}) {
  const { phase, caption, error, getAmplitude, start, stop } = useVapiCall({ publicKey, assistantId, variableValues })

  const live = phase === 'connecting' || phase === 'speaking' || phase === 'listening' || phase === 'thinking'
  const canStart = phase === 'idle' || phase === 'ended' || phase === 'error'
  const dark = tone === 'dark'

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* Orb — the tap target before/after a call; status-only while live. */}
      <button
        type="button"
        onClick={canStart ? start : undefined}
        disabled={phase === 'connecting'}
        aria-label={live ? 'In call' : 'Start voice call'}
        className={`rounded-full outline-none transition focus-visible:ring-4 focus-visible:ring-brand/30 ${
          canStart ? 'cursor-pointer hover:scale-[1.03] active:scale-95' : 'cursor-default'
        }`}
      >
        <VoiceOrb phase={phase} getAmplitude={getAmplitude} size={SIZE_MAP[size]} />
      </button>

      {/* Status line — the headline "what's happening right now". */}
      <div className="flex items-center gap-2" aria-live="polite">
        <span
          className="h-1.5 w-1.5 rounded-full transition-colors"
          style={{ background: phase === 'speaking' ? 'var(--brand)' : phase === 'listening' ? 'var(--teal)' : 'var(--faint)' }}
        />
        <span className={`text-sm font-medium ${dark ? 'text-white' : 'text-ink'}`}>{STATUS[phase]}</span>
      </div>

      {/* Live caption — the most recent thing said. Reserved height = no layout shift. */}
      <p
        className={`min-h-[2.5rem] max-w-xs text-balance text-center text-[13px] leading-snug transition-opacity ${dark ? 'text-white/75' : 'text-muted'}`}
        aria-live="polite"
      >
        {caption ? (
          <>
            <span className="font-medium" style={{ color: caption.role === 'user' ? 'var(--teal)' : 'var(--brand)' }}>
              {caption.role === 'user' ? 'You' : 'SkipDesk'}
            </span>
            <span className={dark ? 'text-white/40' : 'text-faint'}> · </span>
            <span>{caption.text}</span>
          </>
        ) : live ? (
          <span className={dark ? 'text-white/40' : 'text-faint'}>Listening for the conversation…</span>
        ) : (
          ''
        )}
      </p>

      {/* Controls */}
      {live ? (
        <button
          type="button"
          onClick={stop}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
            dark
              ? 'border-white/25 bg-white/10 text-white hover:bg-white/15'
              : 'border-rose/30 bg-rose/10 text-rose hover:bg-rose/15'
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: dark ? '#fff' : 'var(--rose)' }} />
          End call
        </button>
      ) : (
        <button type="button" onClick={start} className={`btn px-5 py-2 text-sm ${dark ? 'btn-cream' : 'btn-brand'}`}>
          {phase === 'error' ? 'Try again' : phase === 'ended' ? 'Call again' : 'Start the call'}
        </button>
      )}

      {error && <span className={`max-w-xs text-center text-xs ${dark ? 'text-white/80' : 'text-rose'}`}>{error}</span>}

      {/* Optional prompts before the first call */}
      {hints && hints.length > 0 && canStart && (
        <div className="mt-1 flex w-full max-w-sm flex-wrap items-center justify-center gap-1.5">
          {hints.map((h) => (
            <div
              key={h}
              className={`rounded-full px-3 py-1.5 text-[13px] ${
                dark ? 'border border-white/15 bg-white/5 text-white/75' : 'border border-line bg-panel2 text-muted'
              }`}
            >
              {h}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
