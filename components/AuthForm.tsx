'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Brand } from './Brand'

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter()
  const params = useSearchParams()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSignup = mode === 'signup'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      // signup always goes to onboarding; login goes where the account is.
      const next = params.get('next')
      router.push(isSignup || !data.onboarded ? '/onboarding' : next || '/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-6xl px-6 py-6">
        <Brand />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-sm animate-rise">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {isSignup ? 'Start your AI front desk in minutes.' : 'Sign in to your SkipDesk dashboard.'}
          </p>

          <form onSubmit={submit} className="card mt-7 space-y-4 p-6">
            {isSignup && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Your name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Alex Rivera"
                  className="field"
                  autoComplete="name"
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Email</span>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@business.com"
                className="field"
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Password</span>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
                className="field"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
              />
            </label>
            {error && <p className="text-sm text-rose">{error}</p>}
            <button disabled={loading} className="btn btn-primary w-full justify-center py-3">
              {loading ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            {isSignup ? (
              <>Already have an account? <Link href="/login" className="font-medium text-ink underline-offset-2 hover:underline">Sign in</Link></>
            ) : (
              <>New to SkipDesk? <Link href="/signup" className="font-medium text-ink underline-offset-2 hover:underline">Create an account</Link></>
            )}
          </p>
        </div>
      </main>
    </div>
  )
}
