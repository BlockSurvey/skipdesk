'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { BusinessSummary } from '@/lib/api'

export function BusinessSwitcher({
  businesses,
  currentId,
  variant = 'bar',
}: {
  businesses: BusinessSummary[]
  currentId: string
  variant?: 'bar' | 'sidebar'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const current = businesses.find((b) => b.id === currentId)
  const sidebar = variant === 'sidebar'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`flex items-center gap-2.5 ${
          sidebar ? 'w-full rounded-lg border border-line bg-panel px-2.5 py-2' : 'rounded-lg border border-line bg-panel px-3 py-2'
        } text-sm transition hover:border-[#d9d9d4]`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-white">
          {current?.name.slice(0, 1) ?? '?'}
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-medium text-ink">{current?.name ?? 'Select business'}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-faint">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className={`absolute ${sidebar ? 'left-0 right-0 top-12' : 'left-0 top-12 w-72'} z-50 overflow-hidden rounded-xl border border-line bg-panel shadow-lg`}>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {businesses.map((b) => (
              <button
                key={b.id}
                onMouseDown={() => router.push(`/business/${b.id}`)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-panel2 ${b.id === currentId ? 'bg-panel2' : ''}`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-white">
                  {b.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{b.name}</span>
                  <span className="block text-[11px] text-faint">{b.counts.calls} calls · {b.counts.appointments} appts</span>
                </span>
                {b.id === currentId && <span className="h-1.5 w-1.5 rounded-full bg-teal" />}
              </button>
            ))}
          </div>
          <a href="/register" className="flex items-center gap-2 border-t border-line px-3.5 py-2.5 text-sm font-medium text-ink transition hover:bg-panel2">
            <span className="text-base text-faint">+</span> Onboard a new business
          </a>
        </div>
      )}
    </div>
  )
}
