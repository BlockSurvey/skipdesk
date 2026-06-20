'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Brand } from './Brand'

const TIMEZONES = ['Asia/Kolkata', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London', 'Asia/Dubai', 'Asia/Singapore', 'Australia/Sydney', 'UTC']
const INDUSTRIES = ['Dental / Medspa', 'Medical clinic', 'Salon / Spa', 'Fitness studio', 'Home services', 'Veterinary', 'Professional services', 'Other']
const DAYS = [
  { dow: 1, label: 'Mon' }, { dow: 2, label: 'Tue' }, { dow: 3, label: 'Wed' },
  { dow: 4, label: 'Thu' }, { dow: 5, label: 'Fri' }, { dow: 6, label: 'Sat' }, { dow: 0, label: 'Sun' },
]
const STEPS = ['Business', 'Hours', 'Preferences']

type Hour = { day_of_week: number; open_time: string; close_time: string; closed: boolean }
const initialHours = (): Hour[] =>
  DAYS.map((d) => ({ day_of_week: d.dow, open_time: '09:00', close_time: '18:00', closed: d.dow === 0 || d.dow === 6 }))

type Done = { business: { id: string; name: string }; api_key: string; mcp_url: string }

export function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [biz, setBiz] = useState({ name: '', industry: INDUSTRIES[0], timezone: 'Asia/Kolkata', phone: '', address: '' })
  const [hours, setHours] = useState<Hour[]>(initialHours)
  const [prefs, setPrefs] = useState({ agentName: '', greeting: '', defaultAppointmentMinutes: 30 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [copied, setCopied] = useState(false)

  const setHour = (dow: number, patch: Partial<Hour>) =>
    setHours((hs) => hs.map((h) => (h.day_of_week === dow ? { ...h, ...patch } : h)))

  const canNext = step !== 0 || biz.name.trim().length > 0

  async function finish() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...biz, ...prefs, hours }),
      })
      // Already onboarded (e.g. a stale token showed this page) → just go to the dashboard.
      if (res.status === 409) {
        router.push('/dashboard')
        router.refresh()
        return
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create your business')
      setDone(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="animate-rise">
          <span className="pill bg-[color-mix(in_srgb,var(--teal)_12%,transparent)] text-teal">
            <span className="h-1.5 w-1.5 rounded-full bg-teal" /> You're live
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">{done.business.name} is ready.</h1>
          <p className="mt-2 text-muted">Save this API key now — it's shown only once. Your voice agent uses it to send every call, lead, and booking to your dashboard.</p>

          <div className="card mt-7 p-6">
            <div className="text-xs font-medium text-faint">API key</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg border border-line bg-panel2 px-3 py-2.5 font-mono text-sm text-ink">{done.api_key}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(done.api_key); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                className="btn"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="mt-5 text-xs font-medium text-faint">MCP endpoint</div>
            <code className="mt-2 block overflow-x-auto rounded-lg border border-line bg-panel2 px-3 py-2.5 font-mono text-sm text-muted">{done.mcp_url}</code>
          </div>

          <button onClick={() => { router.push('/dashboard'); router.refresh() }} className="btn btn-primary mt-6 w-full justify-center py-3">
            Open my dashboard →
          </button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      {/* Stepper */}
      <div className="mb-7 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${i <= step ? 'bg-primary text-white' : 'border border-line text-faint'}`}>{i + 1}</span>
            <span className={`text-sm ${i === step ? 'font-medium text-ink' : 'text-faint'}`}>{s}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-line" />}
          </div>
        ))}
      </div>

      <div className="card p-6">
        {step === 0 && (
          <div className="space-y-4 animate-rise">
            <h2 className="text-lg font-semibold text-ink">Tell us about your business</h2>
            <Field label="Business name" required>
              <input value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} placeholder="Sunrise Dental Care" className="field" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Industry">
                <select value={biz.industry} onChange={(e) => setBiz({ ...biz, industry: e.target.value })} className="field">
                  {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                </select>
              </Field>
              <Field label="Timezone">
                <select value={biz.timezone} onChange={(e) => setBiz({ ...biz, timezone: e.target.value })} className="field">
                  {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business phone">
                <input value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} placeholder="+1 415 555 0142" className="field" />
              </Field>
              <Field label="Address">
                <input value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} placeholder="123 Main St" className="field" />
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3 animate-rise">
            <h2 className="text-lg font-semibold text-ink">When are you open?</h2>
            <p className="text-sm text-muted">Your AI only books appointments inside these hours. You can refine them later.</p>
            <div className="mt-2 space-y-1.5">
              {DAYS.map((d) => {
                const h = hours.find((x) => x.day_of_week === d.dow)!
                return (
                  <div key={d.dow} className="flex items-center gap-3 rounded-lg border border-line p-2.5">
                    <span className="w-10 text-sm font-medium text-ink">{d.label}</span>
                    <label className="flex items-center gap-1.5 text-xs text-muted">
                      <input type="checkbox" checked={!h.closed} onChange={(e) => setHour(d.dow, { closed: !e.target.checked })} />
                      Open
                    </label>
                    {!h.closed ? (
                      <div className="flex items-center gap-2">
                        <input type="time" value={h.open_time} onChange={(e) => setHour(d.dow, { open_time: e.target.value })} className="field !w-auto !py-1.5" />
                        <span className="text-faint">—</span>
                        <input type="time" value={h.close_time} onChange={(e) => setHour(d.dow, { close_time: e.target.value })} className="field !w-auto !py-1.5" />
                      </div>
                    ) : (
                      <span className="text-sm text-faint">Closed</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-rise">
            <h2 className="text-lg font-semibold text-ink">How should your receptionist sound?</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Agent name">
                <input value={prefs.agentName} onChange={(e) => setPrefs({ ...prefs, agentName: e.target.value })} placeholder="Sam" className="field" />
              </Field>
              <Field label="Default appointment length">
                <select value={prefs.defaultAppointmentMinutes} onChange={(e) => setPrefs({ ...prefs, defaultAppointmentMinutes: Number(e.target.value) })} className="field">
                  {[15, 20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </select>
              </Field>
            </div>
            <Field label="Greeting (optional)">
              <input value={prefs.greeting} onChange={(e) => setPrefs({ ...prefs, greeting: e.target.value })} placeholder="Thanks for calling Sunrise Dental! This is Sam — how can I help?" className="field" />
            </Field>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-rose">{error}</p>}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="btn disabled:opacity-40">‹ Back</button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="btn btn-primary disabled:opacity-40">Continue →</button>
        ) : (
          <button onClick={finish} disabled={loading} className="btn btn-primary">{loading ? 'Creating…' : 'Finish & go live'}</button>
        )}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-6xl px-6 py-6"><Brand /></header>
      <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-24 pt-4">{children}</main>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}{required && <span className="text-rose"> *</span>}</span>
      {children}
    </label>
  )
}
