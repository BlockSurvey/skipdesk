import Link from 'next/link'
import { Brand } from '@/components/Brand'
import { TryAgent } from '@/components/TryAgent'
import { getPublicWidgetConfig } from '@/lib/api'

export const dynamic = 'force-dynamic'

// The public agent the landing-page demo talks to (seeded demo tenant w/ hours + FAQs).
const DEMO_SLUG = 'sunrise-clinic'

const PILLARS = [
  {
    title: 'Heard',
    body: 'Answers every call instantly, 24/7 — no voicemail, no hold music, no missed customer. Even at 2am or during the lunch rush.',
    dot: 'var(--amber)',
  },
  {
    title: 'Assisted',
    body: 'Answers questions from your FAQs and books real appointments against your live availability — then reads the details back to confirm.',
    dot: 'var(--teal)',
  },
  {
    title: 'Guided',
    body: "When it can't close on the call, it captures the caller's intent as a lead and escalates to your team — so nothing slips.",
    dot: 'var(--steel)',
  },
]

const STEPS = [
  { n: '01', title: 'Create your account', body: 'Email and password. No credit card, no sales call.' },
  { n: '02', title: 'Onboard your business', body: 'Hours, services, and how your AI receptionist should sound — in a 3-step setup.' },
  { n: '03', title: 'Point your number at it', body: 'Connect your phone line or voice agent and your front desk is live.' },
]

export default async function Landing() {
  const demo = await getPublicWidgetConfig(DEMO_SLUG)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Brand />
          <nav className="flex items-center gap-2">
            <Link href="/login" className="btn">Sign in</Link>
            <Link href="/signup" className="btn btn-primary">Get started</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] opacity-70"
            style={{ background: 'radial-gradient(60% 100% at 50% 0%, color-mix(in srgb, var(--amber) 14%, transparent), transparent 70%)' }}
          />
          <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-20 text-center">
            <span className="pill mx-auto bg-panel2 text-muted">AI front desk for small business</span>
            <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight text-ink md:text-6xl">
              <span className="block">Answer Every Call.</span>
              <span className="block text-amber md:whitespace-nowrap">Capture Every Opportunity.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted">
              SkipDesk is an AI-powered front desk agent that ensures{' '}
              <span className="font-medium text-ink">no customer call goes unanswered</span>. It understands
              customer intent, answers questions, books appointments, and helps businesses convert every
              conversation into revenue.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a href="#try" className="btn btn-primary px-5 py-3 text-[15px]">🎙 Talk to the agent — live</a>
              <Link href="/signup" className="btn px-5 py-3 text-[15px]">Get started free</Link>
            </div>
            <p className="mt-4 text-xs text-faint">No signup to try · no credit card · live in minutes</p>

            {/* Live, interactive demo — the conversion centerpiece */}
            <div id="try" className="mx-auto mt-14 max-w-4xl scroll-mt-24">
              {demo ? (
                <TryAgent config={demo} />
              ) : (
                <div className="card p-10 text-center text-sm text-muted">The live demo is warming up — please refresh in a moment.</div>
              )}
            </div>
          </div>
        </section>

        {/* ICP strip */}
        <section className="border-y border-line bg-panel2/50">
          <div className="mx-auto max-w-6xl px-6 py-6 text-center text-sm text-muted">
            Built for <span className="text-ink">clinics, dental & medspas, salons, studios, and local service businesses</span> — anyone who loses revenue to a ringing phone.
          </div>
        </section>

        {/* Problem */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-ink">A missed call is a missed customer.</h2>
              <p className="mt-4 text-muted">
                Small teams can't answer every call — they're with a customer, it's after hours, or the line's already busy.
                Those callers don't leave a voicemail. They call the next business.
              </p>
              <p className="mt-3 text-muted">
                SkipDesk picks up every time, sounds like your best receptionist, and turns the call into a booking or a
                follow-up you can actually win.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat big="24/7" small="always answering" />
              <Stat big="0" small="calls to voicemail" accent="var(--teal)" />
              <Stat big="<1 min" small="to set up" />
              <Stat big="1 number" small="for your whole front desk" />
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section className="border-t border-line bg-panel2/40">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-ink">Every caller, handled three ways.</h2>
              <p className="mt-3 text-muted">The conversation feels natural; the backend guarantees nothing is lost.</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {PILLARS.map((p) => (
                <div key={p.title} className="card p-6">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.dot }} />
                    <span className="text-base font-semibold text-ink">{p.title}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-ink">Live in three steps.</h2>
            <p className="mt-3 text-muted">No integrations to wire up, no engineers required.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="card p-6">
                <div className="font-mono text-sm text-amber">{s.n}</div>
                <div className="mt-3 text-base font-semibold text-ink">{s.title}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="card relative overflow-hidden p-10 text-center md:p-14">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{ background: 'radial-gradient(50% 120% at 50% 0%, color-mix(in srgb, var(--teal) 12%, transparent), transparent 70%)' }}
            />
            <div className="relative">
              <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-tight text-ink">
                Stop letting the phone cost you customers.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-muted">Set up your AI front desk in minutes — and never miss another call.</p>
              <div className="mt-7 flex justify-center">
                <Link href="/signup" className="btn btn-primary px-6 py-3 text-[15px]">Get started free</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-faint sm:flex-row">
          <Brand small />
          <span>© {2026} SkipDesk · The AI front desk for small business</span>
        </div>
      </footer>
    </div>
  )
}

function Stat({ big, small, accent }: { big: string; small: string; accent?: string }) {
  return (
    <div className="card p-5">
      <div className="text-2xl font-semibold tracking-tight" style={accent ? { color: accent } : { color: 'var(--ink)' }}>{big}</div>
      <div className="mt-1 text-xs text-faint">{small}</div>
    </div>
  )
}
