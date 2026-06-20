'use client'

import { useMemo, useState } from 'react'
import type { Appointment } from '@/lib/api'
import { fmtTime, initials, STATUS_COLOR } from '@/lib/format'
import { Badge } from './Badge'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Explicit names so date labels are byte-identical on server and client (avoids
// locale/ICU separator differences that would break hydration).
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** yyyy-mm-dd for an instant, as seen in the business timezone. */
function localKey(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}
function todayKey(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function CalendarBoard({ appointments, tz }: { appointments: Appointment[]; tz: string }) {
  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>()
    for (const a of appointments) {
      const k = localKey(a.starts_at, tz)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(a)
    }
    for (const list of m.values()) list.sort((x, y) => x.starts_at.localeCompare(y.starts_at))
    return m
  }, [appointments, tz])

  const today = todayKey(tz)
  const [cursor, setCursor] = useState(() => {
    const [y, mo] = today.split('-').map(Number)
    return { y: y!, mo: mo! }
  })
  const [selected, setSelected] = useState<string>(today)

  const first = new Date(Date.UTC(cursor.y, cursor.mo - 1, 1))
  const startWeekday = (first.getUTCDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(Date.UTC(cursor.y, cursor.mo, 0)).getUTCDate()
  const monthLabel = `${MONTHS[cursor.mo - 1]} ${cursor.y}`

  const cells: (string | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${cursor.y}-${String(cursor.mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }

  const shift = (delta: number) => {
    let mo = cursor.mo + delta
    let y = cursor.y
    if (mo < 1) { mo = 12; y-- }
    if (mo > 12) { mo = 1; y++ }
    setCursor({ y, mo })
  }

  const dayAppts = byDay.get(selected) ?? []
  const [sy, sm, sd] = selected.split('-').map(Number)
  const selectedLabel = `${WEEKDAYS_LONG[new Date(Date.UTC(sy!, sm! - 1, sd!)).getUTCDay()]} ${sd} ${MONTHS_SHORT[sm! - 1]}`

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-2xl text-ink">{monthLabel}</h3>
          <div className="flex gap-1">
            <NavBtn dir="‹" onClick={() => shift(-1)} />
            <button onClick={() => { setCursor({ y: Number(today.slice(0, 4)), mo: Number(today.slice(5, 7)) }); setSelected(today) }} className="rounded-lg border border-line px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted transition hover:text-amber">Today</button>
            <NavBtn dir="›" onClick={() => shift(1)} />
          </div>
        </div>
        <div className="mb-2 grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center font-mono text-[10px] uppercase tracking-wider text-faint">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((key, i) => {
            if (!key) return <div key={i} />
            const appts = byDay.get(key) ?? []
            const isToday = key === today
            const isSel = key === selected
            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={`relative flex aspect-square flex-col items-center justify-start rounded-lg border p-1.5 transition ${
                  isSel ? 'border-[#d2d2cc] bg-panel2' : appts.length ? 'border-line bg-panel hover:bg-panel2' : 'border-transparent hover:bg-panel2'
                }`}
              >
                <span className={`font-mono text-xs ${isToday ? 'text-amber' : appts.length ? 'text-ink' : 'text-faint'}`}>{Number(key.slice(8))}</span>
                {appts.length > 0 && (
                  <div className="mt-auto flex flex-wrap justify-center gap-0.5">
                    {appts.slice(0, 4).map((a) => (
                      <span key={a.id} className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[a.status] ?? 'var(--faint)' }} />
                    ))}
                  </div>
                )}
                {appts.length > 4 && <span className="font-mono text-[8px] text-faint">+{appts.length - 4}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-panel2 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h4 className="text-sm font-medium text-ink">{selectedLabel}</h4>
          <span className="text-xs font-medium text-amber">{dayAppts.length} appt{dayAppts.length === 1 ? '' : 's'}</span>
        </div>
        {dayAppts.length === 0 ? (
          <p className="py-8 text-center text-sm text-faint">No appointments this day.</p>
        ) : (
          <div className="space-y-2">
            {dayAppts.map((a) => (
              <div key={a.id} className="rounded-lg border border-line bg-panel p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium text-ink">{fmtTime(a.starts_at, tz)}</span>
                  <Badge label={a.status} color={STATUS_COLOR[a.status] ?? 'var(--faint)'} />
                </div>
                <div className="mt-2 flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-panel2 font-mono text-[10px] text-muted">{initials(a.customer_name)}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm text-ink">{a.customer_name}</div>
                    <div className="truncate font-mono text-[11px] text-faint">{a.service}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NavBtn({ dir, onClick }: { dir: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted transition hover:border-amber/40 hover:text-amber">
      {dir}
    </button>
  )
}
