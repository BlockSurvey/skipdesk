import Link from 'next/link'
import { getBusinesses, type BusinessSummary } from '@/lib/api'
import { Brand } from '@/components/Brand'

export const dynamic = 'force-dynamic'

export default async function Home() {
  let businesses: BusinessSummary[] = []
  let error = false
  try {
    businesses = await getBusinesses()
  } catch {
    error = true
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-6 backdrop-blur-xl">
        <Brand />
        <Link href="/register" className="btn btn-primary">+ New business</Link>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="animate-rise pt-16">
          <span className="pill bg-panel2 text-muted">Front desk intelligence</span>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight text-ink md:text-5xl">
            Every call your AI front desk answered, in full view.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Choose a business to see its filled calendar, who reached out, and what every conversation was about — all on one page.
          </p>
        </section>

        <section className="mt-14 pb-20">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-ink">Your businesses</h2>
            <span className="text-xs text-faint">{businesses.length} active</span>
          </div>

          {error && (
            <div className="card p-6 text-sm text-rose">Couldn’t reach the data service. Is the worker deployed?</div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.map((b, i) => (
              <Link
                key={b.id}
                href={`/business/${b.id}`}
                className="card group animate-rise p-5 transition hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)]"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-base font-semibold text-white">
                    {b.name.slice(0, 1)}
                  </span>
                  <span className="pill bg-[color-mix(in_srgb,var(--teal)_12%,transparent)] text-teal">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal" /> {b.status}
                  </span>
                </div>
                <h3 className="mt-4 font-semibold text-ink transition group-hover:text-primary">{b.name}</h3>
                <p className="text-xs text-faint">/{b.slug} · {b.timezone}</p>
                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4">
                  <Stat label="calls" value={b.counts.calls} />
                  <Stat label="appts" value={b.counts.appointments} />
                  <Stat label="leads" value={b.counts.leads} />
                </div>
              </Link>
            ))}

            <Link
              href="/register"
              className="flex min-h-[196px] flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed border-line text-muted transition hover:border-[#d2d2cc] hover:bg-panel2"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-xl">+</span>
              <span className="text-sm font-medium">Onboard a business</span>
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold text-ink">{value}</div>
      <div className="text-[11px] text-faint">{label}</div>
    </div>
  )
}
