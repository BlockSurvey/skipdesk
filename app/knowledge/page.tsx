import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getMyConfig, getMyDocuments } from '@/lib/api'
import { getSession } from '@/lib/auth-server'
import { Brand } from '@/components/Brand'
import { KnowledgeManager } from '@/components/KnowledgeManager'

export const dynamic = 'force-dynamic'

export default async function KnowledgePage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!session.onboarded) redirect('/onboarding')
  // Source of truth is the worker (not the token's onboarded claim) — same guard
  // /settings uses, so a pre-onboarding token can't trap the user here.
  const config = await getMyConfig()
  if (!config) redirect('/dashboard')
  const docs = await getMyDocuments()

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Brand small />
          <Link href="/dashboard" className="text-sm text-muted transition hover:text-ink">← Dashboard</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <KnowledgeManager initialDocs={docs} />
      </main>
    </div>
  )
}
