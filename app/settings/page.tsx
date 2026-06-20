import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getMyConfig } from '@/lib/api'
import { getSession } from '@/lib/auth-server'
import { Brand } from '@/components/Brand'
import { SettingsForm } from '@/components/SettingsForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!session.onboarded) redirect('/onboarding')
  const config = await getMyConfig()
  if (!config) redirect('/dashboard')

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <Brand small />
          <Link href="/dashboard" className="text-sm text-muted transition hover:text-ink">← Dashboard</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your business profile, hours, knowledge, and API key.</p>
        <SettingsForm config={config} userEmail={session.user.email} />
      </main>
    </div>
  )
}
