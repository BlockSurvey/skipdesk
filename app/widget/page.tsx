import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Brand } from '@/components/Brand'
import { WidgetManager } from '@/components/WidgetManager'
import { getMyConfig, getMyWidget, getPublicWidgetConfig } from '@/lib/api'
import { getSession } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export default async function WidgetPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!session.onboarded) redirect('/onboarding')
  // Source of truth is the worker (same guard /knowledge + /settings use).
  const config = await getMyConfig()
  if (!config) redirect('/dashboard')

  const widget = await getMyWidget()
  // Pull the same public context the live widget uses, so the preview is faithful.
  const pub = config.business.slug ? await getPublicWidgetConfig(config.business.slug) : null

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Brand small />
          <Link href="/dashboard" className="text-sm text-muted transition hover:text-ink">← Dashboard</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <WidgetManager initial={widget} variableValues={pub?.variableValues} />
      </main>
    </div>
  )
}
