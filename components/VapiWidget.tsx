'use client'

import { LiveVoiceOrb } from './LiveVoiceOrb'

/**
 * Back-compat wrapper. The voice experience now lives in <LiveVoiceOrb> (the
 * signature voice orb), but existing call sites — TryAgent, /talk/[slug], and
 * WidgetManager — still import <VapiWidget>, so this keeps their props working
 * and just maps the old size names onto the orb.
 *
 * We still drive Vapi through the SDK's start(assistantId, { variableValues })
 * shape (never the <vapi-widget> web component, which 400s) — see useVapiCall.
 */
export function VapiWidget({
  publicKey,
  assistantId,
  variableValues,
  size,
  hints,
}: {
  publicKey: string
  assistantId: string
  variableValues?: Record<string, string>
  // mode kept for call-site compatibility; this renderer is always inline voice.
  mode?: 'voice' | 'chat' | 'hybrid'
  size?: 'compact' | 'full' | 'tiny'
  hints?: string[]
}) {
  const orbSize = size === 'compact' || size === 'tiny' ? 'panel' : 'full'
  return (
    <LiveVoiceOrb
      publicKey={publicKey}
      assistantId={assistantId}
      variableValues={variableValues}
      size={orbSize}
      hints={hints}
    />
  )
}
