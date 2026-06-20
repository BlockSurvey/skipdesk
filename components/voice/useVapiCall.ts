'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type Vapi from '@vapi-ai/web'

import type { OrbPhase } from './VoiceOrb'

export type Caption = { role: 'assistant' | 'user'; text: string } | null

/**
 * Wraps Vapi's official @vapi-ai/web SDK and turns its raw events into a clean
 * conversation state machine the UI can render: a single `phase`, a live
 * `caption`, and a polled `getAmplitude()` for the reactive halo.
 *
 * State machine (events → phase):
 *   start()       → connecting
 *   call-start    → thinking      (assistant about to greet)
 *   speech-start  → speaking
 *   speech-end    → listening     (your turn)
 *   message/user final → thinking (agent composing a reply)
 *   call-end      → ended → idle  (settles after a beat)
 *   error         → error
 *
 * We deliberately use start(assistantId, { variableValues }) — NOT the
 * <vapi-widget> web component, which nests assistantId and 400s (see VapiWidget
 * history). Amplitude comes from `volume-level` (assistant output, 0–1) and is
 * only surfaced while speaking, so the halo reacts to the agent's real voice.
 */
export function useVapiCall({
  publicKey,
  assistantId,
  variableValues,
}: {
  publicKey: string
  assistantId: string
  variableValues?: Record<string, string>
}) {
  const vapiRef = useRef<Vapi | null>(null)
  const ampRef = useRef(0)
  const phaseRef = useRef<OrbPhase>('idle')
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [phase, setPhaseState] = useState<OrbPhase>('idle')
  const [caption, setCaption] = useState<Caption>(null)
  const [error, setError] = useState<string | null>(null)

  // Keep a ref mirror of phase so getAmplitude (polled outside React) stays cheap.
  const setPhase = useCallback((p: OrbPhase) => {
    phaseRef.current = p
    setPhaseState(p)
  }, [])

  useEffect(() => {
    return () => {
      if (endTimer.current) clearTimeout(endTimer.current)
      vapiRef.current?.stop()
      vapiRef.current?.removeAllListeners?.()
      vapiRef.current = null
    }
  }, [])

  // Halo only reacts while the agent is actually speaking; otherwise it rests.
  const getAmplitude = useCallback(() => (phaseRef.current === 'speaking' ? ampRef.current : 0), [])

  const start = useCallback(async () => {
    if (endTimer.current) clearTimeout(endTimer.current)
    setError(null)
    setCaption(null)
    setPhase('connecting')
    try {
      if (!vapiRef.current) {
        const { default: Vapi } = await import('@vapi-ai/web')
        const vapi = new Vapi(publicKey)
        vapi.on('call-start', () => setPhase('thinking'))
        vapi.on('call-end', () => {
          ampRef.current = 0
          setPhase('ended')
          if (endTimer.current) clearTimeout(endTimer.current)
          endTimer.current = setTimeout(() => {
            setPhase('idle')
            setCaption(null)
          }, 1800)
        })
        vapi.on('speech-start', () => setPhase('speaking'))
        vapi.on('speech-end', () => setPhase('listening'))
        vapi.on('volume-level', (v: number) => {
          ampRef.current = Math.max(0, Math.min(1, v))
        })
        vapi.on('message', (m: { type?: string; role?: string; transcriptType?: string; transcript?: string }) => {
          if (m?.type === 'transcript' && typeof m.transcript === 'string') {
            const role = m.role === 'user' ? 'user' : 'assistant'
            setCaption({ role, text: m.transcript })
            // User finished → the agent is now thinking until it starts speaking.
            if (role === 'user' && m.transcriptType === 'final') setPhase('thinking')
          }
        })
        vapi.on('error', (e: unknown) => {
          setError(e instanceof Error ? e.message : typeof e === 'string' ? e : 'Voice call failed')
          setPhase('error')
        })
        vapiRef.current = vapi
      }
      await vapiRef.current.start(assistantId, { variableValues: variableValues ?? {} })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the call')
      setPhase('error')
    }
  }, [assistantId, publicKey, variableValues, setPhase])

  const stop = useCallback(() => {
    if (endTimer.current) clearTimeout(endTimer.current)
    vapiRef.current?.stop()
    ampRef.current = 0
    setPhase('idle')
    setCaption(null)
  }, [setPhase])

  return { phase, caption, error, getAmplitude, start, stop }
}
