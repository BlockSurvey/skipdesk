import { redirect } from 'next/navigation'
import { getMyConfig } from '@/lib/api'
import { getSession } from '@/lib/auth-server'
import { OnboardingWizard } from '@/components/OnboardingWizard'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  // Authoritative check: if the worker says this account already has a business,
  // send them to the dashboard — never show the wizard twice (even on a stale token).
  const config = await getMyConfig()
  if (config) redirect('/dashboard')
  return <OnboardingWizard />
}
