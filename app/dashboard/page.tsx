import { redirect } from 'next/navigation'
import { getMyDashboard, WORKER_BASE } from '@/lib/api'
import { getSession } from '@/lib/auth-server'
import { AppShell } from '@/components/AppShell'
import { CalendarBoard } from '@/components/CalendarBoard'
import { CallsFeed } from '@/components/CallsFeed'
import { LeadsList } from '@/components/LeadsList'
import { CallsTrend, OutcomeDonut, SentimentSplit } from '@/components/Charts'
import { ClientOnly, Skeleton } from '@/components/ClientOnly'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Source of truth is the worker, not the (stateless, possibly stale) token's
  // `onboarded` claim — so a token issued before onboarding can't trap the user.
  const data = await getMyDashboard()
  if (!data) redirect('/onboarding')
  const { business, kpis, charts } = data
  const tz = business.timezone

  return (
    <AppShell business={business} user={session.user} mcpUrl={`${WORKER_BASE}/mcp`}>
      {/* Overview */}
      <section id="overview" className="scroll-mt-20 animate-rise">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Overview</h1>
            <p className="mt-1 text-sm text-muted">Everything your AI front desk captured for {business.name}.</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Calls handled" value={kpis.totalCalls} sub="last 60 days" dot="var(--amber)" />
          <Kpi label="Appointments" value={kpis.appointmentsBooked} sub={`${kpis.appointmentsUpcoming} upcoming`} dot="var(--teal)" />
          <Kpi label="Conversion" value={`${kpis.conversionRate}%`} sub="calls → booked" dot="var(--steel)" />
          <Kpi label="Positive sentiment" value={`${kpis.positiveRate}%`} sub="of all calls" dot="var(--teal)" />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr]">
          <Card title="Call volume" meta="30 days">
            <CallsTrend data={charts.callsByDay} />
            <div className="mt-2 flex items-center gap-4 text-xs text-faint">
              <Legend color="var(--amber)" label="calls" />
              <Legend color="var(--teal)" label="booked" dashed />
            </div>
          </Card>
          <Card title="Outcomes">
            <OutcomeDonut data={charts.outcomes} />
          </Card>
          <Card title="Sentiment">
            <div className="flex h-full flex-col justify-between gap-4">
              <SentimentSplit data={charts.sentiments} />
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Open leads" value={kpis.leadsOpen} />
                <MiniStat label="Escalations" value={kpis.escalations} accent="var(--rose)" />
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Calendar */}
      <section id="calendar" className="mt-8 scroll-mt-20">
        <SectionHead title="Appointment calendar" desc="Days with bookings are dotted by status — pick a day to see who’s coming in." />
        <Card>
          <ClientOnly fallback={<Skeleton className="h-[360px]" />}>
            <CalendarBoard appointments={data.appointments} tz={tz} />
          </ClientOnly>
        </Card>
      </section>

      {/* Callers */}
      <section id="callers" className="mt-8 scroll-mt-20">
        <SectionHead title="Who reached out" desc={`${data.calls.length} calls — tap any to read its summary and transcript.`} />
        <Card>
          <ClientOnly fallback={<Skeleton className="h-[400px]" />}>
            <CallsFeed calls={data.calls} tz={tz} />
          </ClientOnly>
        </Card>
      </section>

      {/* Leads */}
      <section id="leads" className="mt-8 scroll-mt-20">
        <SectionHead title="Leads to follow up" desc={`${data.leads.length} captured — what the agent couldn’t close on the call.`} />
        <Card>
          <ClientOnly fallback={<Skeleton className="h-[300px]" />}>
            <LeadsList leads={data.leads} />
          </ClientOnly>
        </Card>
      </section>

      <footer className="mt-10 border-t border-line pt-5 text-xs text-faint">
        Data via Skip Desk · timezone {tz}
      </footer>
    </AppShell>
  )
}

function Kpi({ label, value, sub, dot }: { label: string; value: number | string; sub: string; dot: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-ink">{value}</div>
      <div className="mt-1 text-xs text-faint">{sub}</div>
    </div>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel2 p-2.5">
      <div className="text-lg font-semibold text-ink" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="text-[11px] text-faint">{label}</div>
    </div>
  )
}

function Card({ title, meta, children }: { title?: string; meta?: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col p-5">
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {meta && <span className="text-xs text-faint">{meta}</span>}
        </div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}

function SectionHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-0.5 text-sm text-muted">{desc}</p>
    </div>
  )
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-0.5 w-4" style={{ background: dashed ? `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)` : color }} />
      {label}
    </span>
  )
}
