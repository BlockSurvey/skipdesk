import Link from 'next/link'
import { Brand } from '@/components/Brand'

export const dynamic = 'force-dynamic'

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

export default function Landing() {
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
              <Link href="/signup" className="btn btn-primary px-5 py-3 text-[15px]">Get started free</Link>
              <Link href="#how" className="btn px-5 py-3 text-[15px]">See how it works</Link>
            </div>
            <p className="mt-4 text-xs text-faint">No credit card · live in minutes</p>

            {/* Hero visual */}
            <div className="mx-auto mt-14 max-w-4xl">
              <div className="card overflow-hidden p-0 text-left">
                <div className="flex items-center gap-1.5 border-b border-line bg-panel2 px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-teal/60" />
                  <span className="ml-3 font-mono text-[11px] text-faint">skip-desk · live call</span>
                </div>
                <div className="grid gap-4 p-6 md:grid-cols-[1.1fr_1fr]">
                  <div className="space-y-3">
                    <Bubble who="Caller" tone="muted">Hi, do you have anything open tomorrow afternoon?</Bubble>
                    <Bubble who="Skip Desk" tone="ink">Let me check… I have 2:30 or 4:00 PM tomorrow. Which works?</Bubble>
                    <Bubble who="Caller" tone="muted">2:30 is perfect.</Bubble>
                    <Bubble who="Skip Desk" tone="ink">Booked you for 2:30 PM. You'll get a confirmation shortly. 🎉</Bubble>
                  </div>
                  <div className="rounded-xl border border-line bg-panel2 p-4">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-faint">Captured automatically</div>
                    <div className="mt-3 space-y-2.5 text-sm">
                      <Row k="Outcome" v="Appointment booked" accent="var(--teal)" />
                      <Row k="When" v="Tomorrow, 2:30 PM" />
                      <Row k="Caller" v="+1 (415) 555‑0142" mono />
                      <Row k="Sentiment" v="Positive" accent="var(--teal)" />
                    </div>
                  </div>
                </div>
              </div>
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
                Skip Desk picks up every time, sounds like your best receptionist, and turns the call into a booking or a
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
          <span>© {2026} Skip Desk · The AI front desk for small business</span>
        </div>
      </footer>
    </div>
  )
}

function Bubble({ who, tone, children }: { who: string; tone: 'muted' | 'ink'; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-line p-3 ${tone === 'ink' ? 'bg-panel' : 'bg-panel2'}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-faint">{who}</div>
      <div className="mt-1 text-sm text-ink">{children}</div>
    </div>
  )
}

function Row({ k, v, accent, mono }: { k: string; v: string; accent?: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-faint">{k}</span>
      <span className={`text-sm ${mono ? 'font-mono' : ''}`} style={accent ? { color: accent } : { color: 'var(--ink)' }}>{v}</span>
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
