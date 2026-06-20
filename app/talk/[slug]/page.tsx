import { notFound } from 'next/navigation'

import { Brand } from '@/components/Brand'
import { VapiWidget } from '@/components/VapiWidget'
import { getPublicWidgetConfig } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Public, unauthenticated page where anyone can talk to a business's voice agent —
 * both the owner's "test your agent" page and the shareable link. Context (name,
 * hours, FAQ summary) is injected as Vapi variableValues so the one shared assistant
 * speaks as this business.
 */
export default async function TalkPage({ params }: { params: { slug: string } }) {
  const config = await getPublicWidgetConfig(params.slug)
  if (!config) notFound()

  // No on/off gating — if the agent is configured, anyone can talk to it.
  const ready = config.vapiPublicKey && config.vapiAssistantId
  const greeting = config.variableValues.GREETING

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <Brand small />
          <span className="text-xs text-faint">powered by SkipDesk</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span className="pill bg-[color-mix(in_srgb,var(--teal)_12%,transparent)] text-teal">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Front desk · live
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{config.businessName}</h1>

        {ready ? (
          <>
            <p className="mt-3 max-w-md text-balance text-muted">{greeting}</p>
            <p className="mt-1 text-sm text-faint">Tap the button to start a voice conversation — ask a question or leave your details.</p>
            <div className="mt-10">
              <VapiWidget
                publicKey={config.vapiPublicKey!}
                assistantId={config.vapiAssistantId!}
                variableValues={config.variableValues}
                mode="voice"
                size="full"
              />
            </div>
          </>
        ) : (
          <p className="mt-4 max-w-md text-muted">This voice assistant is being set up. Please check back shortly.</p>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-3xl px-6 py-4 text-center text-xs text-faint">
          Your conversation may be recorded to improve service.
        </div>
      </footer>
    </div>
  )
}
