'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type Vapi from '@vapi-ai/web'

/**
 * Voice call button backed by Vapi's official @vapi-ai/web SDK.
 *
 * We deliberately do NOT use the <vapi-widget> web component: in v0.1.1 it nests
 * `assistantId`/`assistantOverrides` under a transient `assistant` object, which Vapi's
 * /call/web rejects ("assistant.property assistantId should not exist" → 400). The SDK's
 * `start(assistantId, { variableValues })` sends the correct top-level shape, so per-business
 * context is injected reliably.
 */
type Status = 'idle' | 'connecting' | 'active' | 'error'

export function VapiWidget({
  publicKey,
  assistantId,
  variableValues,
}: {
  publicKey: string
  assistantId: string
  variableValues?: Record<string, string>
  // mode/size kept for call-site compatibility; this renderer is always inline voice.
  mode?: 'voice' | 'chat' | 'hybrid'
  size?: 'compact' | 'full' | 'tiny'
}) {
  const vapiRef = useRef<Vapi | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tear down the call + listeners on unmount.
  useEffect(() => {
    return () => {
      vapiRef.current?.stop()
      vapiRef.current?.removeAllListeners?.()
      vapiRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setStatus('connecting')
    try {
      if (!vapiRef.current) {
        const { default: Vapi } = await import('@vapi-ai/web')
        const vapi = new Vapi(publicKey)
        vapi.on('call-start', () => setStatus('active'))
        vapi.on('call-end', () => {
          setStatus('idle')
          setSpeaking(false)
        })
        vapi.on('speech-start', () => setSpeaking(true))
        vapi.on('speech-end', () => setSpeaking(false))
        vapi.on('error', (e: unknown) => {
          const m = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Voice call failed'
          setError(m)
          setStatus('error')
        })
        vapiRef.current = vapi
      }
      // Correct shape: assistantId + assistantOverrides at the top level.
      await vapiRef.current.start(assistantId, { variableValues: variableValues ?? {} })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the call')
      setStatus('error')
    }
  }, [assistantId, publicKey, variableValues])

  const stop = useCallback(() => {
    vapiRef.current?.stop()
    setStatus('idle')
    setSpeaking(false)
  }, [])

  const live = status === 'active'
  const label =
    status === 'connecting' ? 'Connecting…' : live ? (speaking ? 'Listening…' : 'In call — tap to end') : status === 'error' ? 'Tap to retry' : 'Tap to talk'

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={live ? stop : start}
        disabled={status === 'connecting'}
        aria-label={live ? 'End call' : 'Start voice call'}
        className={`relative flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition disabled:opacity-70 ${
          live ? 'bg-rose' : 'bg-primary hover:brightness-110'
        }`}
      >
        {/* pulse ring while the caller is speaking */}
        {live && speaking && <span className="absolute inset-0 animate-ping rounded-full bg-rose/40" />}
        {live ? <IconStop /> : <IconMic />}
      </button>
      <span className="text-sm text-muted">{label}</span>
      {error && <span className="max-w-xs text-center text-xs text-rose">{error}</span>}
    </div>
  )
}

function IconMic() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
function IconStop() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" /></svg>
}
