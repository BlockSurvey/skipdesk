'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { BusinessConfig } from '@/lib/api'

const TIMEZONES = ['Asia/Kolkata', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London', 'Asia/Dubai', 'Asia/Singapore', 'Australia/Sydney', 'UTC']
const DAYS = [
  { dow: 1, label: 'Monday' }, { dow: 2, label: 'Tuesday' }, { dow: 3, label: 'Wednesday' },
  { dow: 4, label: 'Thursday' }, { dow: 5, label: 'Friday' }, { dow: 6, label: 'Saturday' }, { dow: 0, label: 'Sunday' },
]

async function save(path: string, body: unknown, method = 'PUT'): Promise<string | null> {
  const res = await fetch(`/api/proxy/${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    return d.error ?? 'Could not save'
  }
  return null
}

export function SettingsForm({ config, userEmail }: { config: BusinessConfig; userEmail: string }) {
  const router = useRouter()

  // ── Profile + preferences ──────────────────────────────────────────────────
  const b = config.business
  const [profile, setProfile] = useState({
    name: b.name, timezone: b.timezone, industry: b.industry ?? '', phone: b.phone ?? '', address: b.address ?? '',
    agentName: b.agentName ?? '', greeting: b.greeting ?? '', defaultAppointmentMinutes: b.defaultAppointmentMinutes,
  })

  // ── Hours ──────────────────────────────────────────────────────────────────
  const [hours, setHours] = useState(() =>
    DAYS.map((d) => {
      const h = config.hours.find((x) => x.dayOfWeek === d.dow)
      return { day_of_week: d.dow, open_time: h?.openTime ?? '09:00', close_time: h?.closeTime ?? '18:00', closed: h ? h.closed : d.dow === 0 || d.dow === 6 }
    }),
  )
  const setHour = (dow: number, patch: Partial<(typeof hours)[number]>) =>
    setHours((hs) => hs.map((h) => (h.day_of_week === dow ? { ...h, ...patch } : h)))

  // ── FAQs / escalation ───────────────────────────────────────────────────────
  const [faqs, setFaqs] = useState(config.faqs.map((f) => ({ question: f.question, answer: f.answer })))
  const [contacts, setContacts] = useState(config.escalation.map((c) => ({ name: c.name, role: c.role ?? '', phone: c.phone ?? '', email: c.email ?? '' })))

  // ── API key ────────────────────────────────────────────────────────────────
  const [newKey, setNewKey] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)

  return (
    <div className="mt-8 space-y-5">
      {/* Profile */}
      <Section
        title="Business profile"
        onSave={() => save('api/me/business', {
          name: profile.name, timezone: profile.timezone, industry: profile.industry,
          phone: profile.phone, address: profile.address,
        }, 'PATCH')}
        onSaved={() => router.refresh()}
      >
        <Grid>
          <Field label="Business name"><input className="field" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
          <Field label="Timezone">
            <select className="field" value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}>
              {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Industry"><input className="field" value={profile.industry} onChange={(e) => setProfile({ ...profile, industry: e.target.value })} /></Field>
          <Field label="Phone"><input className="field" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
        </Grid>
        <Field label="Address"><input className="field" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} /></Field>
      </Section>

      {/* Preferences */}
      <Section
        title="Agent preferences"
        onSave={() => save('api/me/business', {
          agentName: profile.agentName, greeting: profile.greeting, defaultAppointmentMinutes: profile.defaultAppointmentMinutes,
        }, 'PATCH')}
      >
        <Grid>
          <Field label="Agent name"><input className="field" value={profile.agentName} onChange={(e) => setProfile({ ...profile, agentName: e.target.value })} placeholder="Sam" /></Field>
          <Field label="Default appointment length">
            <select className="field" value={profile.defaultAppointmentMinutes} onChange={(e) => setProfile({ ...profile, defaultAppointmentMinutes: Number(e.target.value) })}>
              {[15, 20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </Field>
        </Grid>
        <Field label="Greeting"><input className="field" value={profile.greeting} onChange={(e) => setProfile({ ...profile, greeting: e.target.value })} placeholder="Thanks for calling…" /></Field>
      </Section>

      {/* Hours */}
      <Section title="Business hours" onSave={() => save('api/me/hours', { hours })}>
        <div className="space-y-1.5">
          {DAYS.map((d) => {
            const h = hours.find((x) => x.day_of_week === d.dow)!
            return (
              <div key={d.dow} className="flex items-center gap-3 rounded-lg border border-line p-2.5">
                <span className="w-24 text-sm text-ink">{d.label}</span>
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" checked={!h.closed} onChange={(e) => setHour(d.dow, { closed: !e.target.checked })} /> Open
                </label>
                {!h.closed ? (
                  <div className="flex items-center gap-2">
                    <input type="time" className="field !w-auto !py-1.5" value={h.open_time} onChange={(e) => setHour(d.dow, { open_time: e.target.value })} />
                    <span className="text-faint">—</span>
                    <input type="time" className="field !w-auto !py-1.5" value={h.close_time} onChange={(e) => setHour(d.dow, { close_time: e.target.value })} />
                  </div>
                ) : <span className="text-sm text-faint">Closed</span>}
              </div>
            )
          })}
        </div>
      </Section>

      {/* FAQs */}
      <Section title="FAQs" desc="What your AI can answer from. The voice agent uses these to respond to common questions." onSave={() => save('api/me/faqs', { faqs })}>
        <div className="space-y-2">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-lg border border-line p-3">
              <input className="field mb-2" placeholder="Question" value={f.question} onChange={(e) => setFaqs(faqs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
              <textarea className="field" rows={2} placeholder="Answer" value={f.answer} onChange={(e) => setFaqs(faqs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
              <button onClick={() => setFaqs(faqs.filter((_, j) => j !== i))} className="mt-2 text-xs text-rose hover:underline">Remove</button>
            </div>
          ))}
          <button onClick={() => setFaqs([...faqs, { question: '', answer: '' }])} className="btn w-full justify-center">+ Add FAQ</button>
        </div>
      </Section>

      {/* Escalation */}
      <Section title="Escalation contacts" desc="Who to notify when the AI can’t help and a caller needs a human." onSave={() => save('api/me/escalation', { contacts })}>
        <div className="space-y-2">
          {contacts.map((c, i) => (
            <div key={i} className="rounded-lg border border-line p-3">
              <Grid>
                <input className="field" placeholder="Name" value={c.name} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className="field" placeholder="Role (optional)" value={c.role} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
                <input className="field" placeholder="Phone" value={c.phone} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
                <input className="field" placeholder="Email" value={c.email} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
              </Grid>
              <button onClick={() => setContacts(contacts.filter((_, j) => j !== i))} className="mt-2 text-xs text-rose hover:underline">Remove</button>
            </div>
          ))}
          <button onClick={() => setContacts([...contacts, { name: '', role: '', phone: '', email: '' }])} className="btn w-full justify-center">+ Add contact</button>
        </div>
      </Section>

      {/* API key */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-ink">API key</h2>
        <p className="mt-1 text-sm text-muted">Your voice agent authenticates with this key. Rotating it immediately revokes the old one.</p>
        {newKey ? (
          <div className="mt-4">
            <div className="text-xs font-medium text-faint">New key — copy it now, it won’t be shown again</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg border border-line bg-panel2 px-3 py-2.5 font-mono text-sm text-ink">{newKey}</code>
              <button onClick={() => navigator.clipboard.writeText(newKey)} className="btn">Copy</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-panel2 px-3 py-2.5">
            <span className="font-mono text-sm text-faint">sk_live_•••••••••••••••• {config.api_key ? `· created ${config.api_key.created_at.slice(0, 10)}` : '· none yet'}</span>
            <button
              onClick={async () => {
                setRotating(true)
                const res = await fetch('/api/proxy/api/me/key/rotate', { method: 'POST' })
                const d = await res.json().catch(() => ({}))
                if (res.ok) setNewKey(d.api_key)
                setRotating(false)
              }}
              className="btn"
            >
              {rotating ? 'Rotating…' : 'Rotate key'}
            </button>
          </div>
        )}
      </div>

      {/* Account */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-ink">Account</h2>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-muted">{userEmail}</span>
          <button
            onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); router.refresh() }}
            className="btn text-rose"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, desc, children, onSave, onSaved }: { title: string; desc?: string; children: React.ReactNode; onSave: () => Promise<string | null>; onSaved?: () => void }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  async function handle() {
    setState('saving'); setError(null)
    const err = await onSave()
    if (err) { setState('error'); setError(err) }
    else { setState('saved'); onSaved?.(); setTimeout(() => setState('idle'), 1800) }
  }
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {desc && <p className="mt-1 text-sm text-muted">{desc}</p>}
        </div>
        <button onClick={handle} disabled={state === 'saving'} className="btn btn-primary shrink-0">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : 'Save'}
        </button>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
      {error && <p className="mt-3 text-sm text-rose">{error}</p>}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}
