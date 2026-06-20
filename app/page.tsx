import Link from 'next/link'
import { BrandMark } from '@/components/Brand'
import { ICP_MARKETING } from '@/lib/icp'
import { CallConsole } from '@/components/CallConsole'
import { Magnetic } from '@/components/Magnetic'
import { Reveal } from '@/components/Reveal'
import { ScrollProgress } from '@/components/ScrollProgress'
import { SiteNav } from '@/components/SiteNav'
import { Spotlight } from '@/components/Spotlight'
import { TiltCard } from '@/components/TiltCard'
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

const STATS = [
  { big: '24/7', small: 'always answering', bg: 'var(--brand)' },
  { big: '0', small: 'calls to voicemail', bg: 'var(--teal)' },
  { big: '<1 min', small: 'to set up', bg: 'var(--ink)' },
  { big: '1 number', small: 'for your whole front desk', bg: 'var(--steel)' },
]

export default async function Landing() {
  const demo = await getPublicWidgetConfig(DEMO_SLUG)

  return (
    <div className="min-h-screen bg-bg">
      <ScrollProgress />
      <div className="grain-overlay" aria-hidden />

      {/* ── Adaptive nav: transparent over the coral hero, frosted-white on scroll ── */}
      <SiteNav />

      <main>
        {/* ── Hero: full-bleed coral colour block + live call console ── */}
        <section className="relative overflow-hidden bg-brand text-white">
          <Aurora />
          <PulseField />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-36 pt-28 md:pb-44 md:pt-32 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
            {/* left: copy */}
            <div className="text-center lg:text-left">
              <span className="pill mx-auto bg-white/15 text-white backdrop-blur-sm lg:mx-0">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                </span>
                AI front desk for small business
              </span>
              <h1 className="mt-6 text-[clamp(2.6rem,4.7vw,4.4rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-white" style={{ textShadow: '0 2px 28px rgba(120,24,4,0.18)' }}>
                <span className="block animate-rise">Answer Every Call.</span>
                <span className="block animate-rise text-ink" style={{ animationDelay: '90ms', textShadow: 'none' }}>Capture Every Opportunity.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/90 lg:mx-0">
                SkipDesk is an AI-powered front desk agent that ensures{' '}
                <span className="font-semibold text-white underline decoration-white/40 underline-offset-4">no customer call goes unanswered</span>. It understands
                customer intent, answers questions, books appointments, and helps businesses convert every
                conversation into revenue.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <Magnetic strength={0.45}>
                  <a href="#try" className="btn btn-cream px-6 py-3.5 text-[15px]">🎙 Talk to the agent — live</a>
                </Magnetic>
                <Magnetic strength={0.45}>
                  <Link href="/signup" className="btn btn-outline-light px-6 py-3.5 text-[15px]">Get started free</Link>
                </Magnetic>
              </div>
              <p className="mt-5 text-xs text-white/70">No signup to try · no credit card · live in minutes</p>
            </div>

            {/* right: live, self-playing call simulation */}
            <div className="relative mx-auto w-full max-w-md animate-rise lg:max-w-none" style={{ animationDelay: '120ms' }}>
              <CallConsole />
            </div>
          </div>
        </section>

        {/* ── Live demo: light band; the card straddles the coral seam above ── */}
        <section className="bg-bg">
          <div id="try" className="mx-auto -mt-28 max-w-4xl scroll-mt-24 px-6 pb-20 md:-mt-32">
            <Reveal>
              {demo ? (
                <div className="lift">
                  <TryAgent config={demo} />
                </div>
              ) : (
                <div className="card p-10 text-center text-sm text-muted">The live demo is warming up — please refresh in a moment.</div>
              )}
            </Reveal>
          </div>
        </section>

        {/* ── ICP strip: dual counter-scrolling ribbons + positioning line ── */}
        <section className="space-y-3 overflow-hidden border-y border-line bg-panel2/50 py-7">
          <div className="marquee-mask">
            <div className="marquee-track gap-3">
              {[...ICP_MARKETING, ...ICP_MARKETING].map((t, i) => (
                <span key={i} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-panel px-4 py-1.5 text-sm font-medium text-ink">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="marquee-mask">
            <div className="marquee-track marquee-reverse gap-3">
              {[...ICP_MARKETING.slice().reverse(), ...ICP_MARKETING.slice().reverse()].map((t, i) => (
                <span key={i} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-panel px-4 py-1.5 text-sm font-medium text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="mx-auto mt-6 max-w-6xl px-6 text-center text-sm text-muted">
            Built for <span className="font-medium text-ink">dental &amp; skin clinics, salons &amp; spas, medical practices, fitness studios, and local home, auto &amp; professional services</span> — anyone who loses revenue to a ringing phone.
          </div>
        </section>

        {/* ── Problem + bold stat tiles ── */}
        <section className="mx-auto max-w-6xl px-6 band-pad">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <h2 className="text-display-sm text-ink">A missed call is a <span className="text-gradient-warm">missed customer.</span></h2>
              <p className="mt-6 text-lg leading-relaxed text-muted">
                Small teams can't answer every call — they're with a customer, it's after hours, or the line's already busy.
                Those callers don't leave a voicemail. They call the next business.
              </p>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                SkipDesk picks up every time, sounds like your best receptionist, and turns the call into a booking or a
                follow-up you can actually win.
              </p>
            </Reveal>
            <div className="grid grid-cols-2 gap-4">
              {STATS.map((s, i) => (
                <Reveal key={s.small} delay={i * 80}>
                  <StatTile big={s.big} small={s.small} bg={s.bg} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pillars: full-bleed dark ink block with a cursor spotlight ── */}
        <section id="why" className="scroll-mt-24 bg-ink text-white">
          <Spotlight>
            <div className="relative z-10 mx-auto max-w-6xl px-6 band-pad">
              <Reveal className="max-w-2xl">
                <h2 className="text-display-sm">Every caller, handled three ways.</h2>
                <p className="mt-4 text-lg text-white/60">The conversation feels natural; the backend guarantees nothing is lost.</p>
              </Reveal>
              <div className="mt-12 grid gap-5 md:grid-cols-3">
                {PILLARS.map((p, i) => (
                  <Reveal key={p.title} delay={i * 90}>
                    <TiltCard className="h-full" max={6}>
                      <div
                        className="glow-border relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-7"
                        style={{ ['--glow' as string]: p.dot }}
                      >
                        {/* oversized ghost index */}
                        <span className="pointer-events-none absolute -right-2 -top-5 select-none text-[7rem] font-extrabold leading-none text-white/[0.05]">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span
                          className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl"
                          style={{ background: `color-mix(in srgb, ${p.dot} 22%, transparent)` }}
                        >
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.dot, boxShadow: `0 0 14px ${p.dot}` }} />
                        </span>
                        <div className="relative mt-5 text-xl font-semibold">{p.title}</div>
                        <p className="relative mt-3 leading-relaxed text-white/65">{p.body}</p>
                      </div>
                    </TiltCard>
                  </Reveal>
                ))}
              </div>
            </div>
          </Spotlight>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-6 band-pad">
          <Reveal className="max-w-2xl">
            <h2 className="text-display-sm text-ink">Live in three steps.</h2>
            <p className="mt-4 text-lg text-muted">No integrations to wire up, no engineers required.</p>
          </Reveal>
          <div className="relative mt-12 grid gap-5 md:grid-cols-3">
            {/* connecting line that draws itself in (md+) */}
            <Reveal className="pointer-events-none absolute inset-x-12 top-9 hidden md:block">
              <div className="h-0.5 origin-left bg-gradient-to-r from-brand via-brand/40 to-transparent" style={{ animation: 'growLine 1.1s cubic-bezier(0.22,1,0.36,1) both' }} />
            </Reveal>
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 110}>
                <TiltCard className="h-full" max={6}>
                  <div className="relative h-full overflow-hidden rounded-3xl border border-line bg-panel p-7">
                    <span className="pointer-events-none absolute -right-1 -top-6 select-none text-[7rem] font-extrabold leading-none text-ink/[0.04]">{s.n}</span>
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-brand font-mono text-lg font-semibold text-white shadow-[0_10px_24px_-8px_rgba(232,70,43,0.6)]">
                      {s.n}
                    </div>
                    <div className="relative mt-5 text-xl font-semibold text-ink">{s.title}</div>
                    <p className="relative mt-2 leading-relaxed text-muted">{s.body}</p>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── CTA: full-bleed coral colour block (bookends the hero) ── */}
        <section className="relative overflow-hidden bg-brand text-white">
          <Aurora />
          <PulseField />
          <div className="relative mx-auto max-w-6xl px-6 band-pad text-center">
            <Reveal>
              <h2 className="mx-auto max-w-3xl text-display">
                Stop letting the phone cost you customers.
              </h2>
              <p className="mx-auto mt-6 max-w-lg text-lg text-white/90">Set up your AI front desk in minutes — and never miss another call.</p>
              <div className="mt-10 flex justify-center">
                <Magnetic strength={0.5}>
                  <Link href="/signup" className="btn btn-cream px-8 py-4 text-base">Get started free</Link>
                </Magnetic>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ── Footer: dark ink with an oversized kinetic ghost wordmark ── */}
      <footer className="relative overflow-hidden bg-ink text-white">
        <div
          aria-hidden
          className="pointer-events-none select-none text-center font-brand font-bold leading-none tracking-tighter text-white/[0.04]"
          style={{ fontSize: 'clamp(5rem, 19vw, 17rem)', marginBottom: '-0.12em' }}
        >
          SkipDesk
        </div>
        <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 border-t border-white/10 px-6 py-10 text-sm text-white/50 sm:flex-row">
          <span className="inline-flex items-center gap-2">
            <BrandMark className="h-5 w-5 text-brand" />
            <span className="font-brand text-lg font-bold tracking-tight text-white">
              Skip<span className="text-brand">Desk</span>
            </span>
          </span>
          <span>© {2026} SkipDesk · The AI front desk for small business</span>
        </div>
      </footer>
    </div>
  )
}

/** Bold colour stat tile — big number on a saturated block, with 3D tilt + sheen. */
function StatTile({ big, small, bg }: { big: string; small: string; bg: string }) {
  return (
    <TiltCard className="h-full" max={9}>
      <div className="relative h-full overflow-hidden rounded-3xl p-6 text-white" style={{ background: bg }}>
        {/* cursor-tracked sheen (TiltCard writes --mx/--my) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: 'radial-gradient(180px circle at var(--mx,50%) var(--my,0%), rgba(255,255,255,0.25), transparent 60%)' }}
        />
        <div className="relative text-3xl font-bold tracking-tight md:text-4xl">{big}</div>
        <div className="relative mt-2 text-sm text-white/75">{small}</div>
      </div>
    </TiltCard>
  )
}

/**
 * Drifting blurred blobs that give the coral bands living, lit atmosphere.
 * Kept on the RIGHT half (behind the console) and tinted warm — never near
 * white — so they can't wash out the white hero headline on the left.
 */
function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <span style={{ width: '42%', height: '66%', right: '-6%', top: '-14%', background: '#ff7a4d', animationDelay: '0s' }} />
      <span style={{ width: '36%', height: '58%', right: '14%', bottom: '-20%', background: '#ff9a6e', animationDelay: '-6s' }} />
      <span style={{ width: '34%', height: '54%', left: '-8%', bottom: '-24%', background: '#d4381d', animationDelay: '-11s' }} />
    </div>
  )
}

/**
 * Decorative voice-pulse equalizer — a wide field of round-capped bars echoing
 * the SkipDesk logo geometry, animated and faded into the coral colour bands.
 */
function PulseField() {
  const bars = Array.from({ length: 28 }, (_, i) => {
    // smooth peak-and-valley heights so the field reads like a waveform
    const wave = Math.sin((i / 27) * Math.PI * 3)
    const h = 26 + (wave * 0.5 + 0.5) * 64
    return { x: i * 16 + 3, h, delay: (i % 7) * 0.18 }
  })
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full opacity-[0.16]"
      viewBox="0 0 448 110"
      preserveAspectRatio="xMidYMax slice"
    >
      {bars.map((b) => (
        <rect
          key={b.x}
          className="pulse-bar"
          x={b.x}
          y={110 - b.h}
          width={9}
          height={b.h}
          rx={4.5}
          fill="#fff"
          style={{ animationDelay: `${b.delay}s` }}
        />
      ))}
    </svg>
  )
}
