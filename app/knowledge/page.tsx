import { redirect } from 'next/navigation'
import { getMyDashboard, getMyDocuments, WORKER_BASE } from '@/lib/api'
import { getSession } from '@/lib/auth-server'
import { AppShell } from '@/components/AppShell'
import { KnowledgeManager } from '@/components/KnowledgeManager'

export const dynamic = 'force-dynamic'

export default async function KnowledgePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Source of truth is the worker (not the token's onboarded claim) — same guard
  // the dashboard uses, so a pre-onboarding token can't trap the user here.
  const data = await getMyDashboard()
  if (!data) redirect('/onboarding')
  const docs = await getMyDocuments()

  return (
    <AppShell business={data.business} user={session.user} mcpUrl={`${WORKER_BASE}/mcp`}>
      <KnowledgeManager initialDocs={docs} />
    </AppShell>
  )
}
