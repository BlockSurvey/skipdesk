'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { WORKER_BASE } from '@/lib/api'
import { Brand } from '@/components/Brand'

const TIMEZONES = ['Asia/Kolkata', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Dubai', 'Asia/Singapore', 'Australia/Sydney', 'UTC']

type Result = { business: { id: string; name: string; slug: string }; api_key: string; mcp_url: string }

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', timezone: 'Asia/Kolkata', escName: '', escPhone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [copied, setCopied] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${WORKER_BASE}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          timezone: form.timezone,
          escalation: form.escName ? { name: form.escName, phone: form.escPhone } : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Registration failed')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-6 backdrop-blur-xl">
        <Brand />
        <Link href="/" className="text-sm text-muted transition hover:text-ink">← Back</Link>
      </header>

      <main className="mx-auto max-w-xl px-6 pb-24">
        {!result ? (
          <div className="animate-rise pt-14">
            <span className="pill bg-panel2 text-muted">Onboarding</span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">Bring a business online.</h1>
            <p className="mt-3 text-muted">We’ll create the tenant and hand you a unique API key. Point any LLM or voice agent at it — every call, lead, and booking lands here.</p>

            <form onSubmit={submit} className="card mt-8 space-y-5 p-6">
              <Field label="Business name" required>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Sunrise Multispecialty Clinic" className="field" />
              </Field>
              <Field label="Timezone">
                <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="field">
                  {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Escalation contact">
                  <input value={form.escName} onChange={(e) => setForm({ ...form, escName: e.target.value })} placeholder="Front office manager" className="field" />
                </Field>
                <Field label="Contact phone">
                  <input value={form.escPhone} onChange={(e) => setForm({ ...form, escPhone: e.target.value })} placeholder="+91…" className="field" />
                </Field>
              </div>
              {error && <p className="text-sm text-rose">{error}</p>}
              <button disabled={loading} className="btn btn-primary w-full justify-center py-3">
                {loading ? 'Creating…' : 'Create business & issue key'}
              </button>
            </form>
          </div>
        ) : (
          <div className="animate-rise pt-14">
            <span className="pill bg-[color-mix(in_srgb,var(--teal)_12%,transparent)] text-teal"><span className="h-1.5 w-1.5 rounded-full bg-teal" /> Created</span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">{result.business.name} is live.</h1>
            <p className="mt-3 text-muted">Save this API key now — it’s shown only once. It authenticates every write so your data stays accurate and isolated.</p>

            <div className="card mt-8 p-6">
              <div className="text-xs font-medium text-faint">API key</div>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-lg border border-line bg-panel2 px-3 py-2.5 font-mono text-sm text-ink">{result.api_key}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(result.api_key); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  className="btn"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="mt-5 text-xs font-medium text-faint">MCP endpoint</div>
              <code className="mt-2 block overflow-x-auto rounded-lg border border-line bg-panel2 px-3 py-2.5 font-mono text-sm text-muted">{result.mcp_url}</code>
              <p className="mt-4 text-xs leading-relaxed text-faint">Configure your agent to connect over Streamable HTTP with header <code className="text-muted">Authorization: Bearer &lt;key&gt;</code>.</p>
            </div>

            <button onClick={() => router.push(`/business/${result.business.id}`)} className="btn btn-primary mt-6 w-full justify-center py-3">
              Open the dashboard →
            </button>
          </div>
        )}
      </main>
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
