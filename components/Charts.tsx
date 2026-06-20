'use client'

import { useState } from 'react'
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DayPoint, Tally } from '@/lib/api'
import { OUTCOME_COLOR, OUTCOME_LABEL, SENTIMENT_COLOR } from '@/lib/format'

/**
 * Interactive, animated charts (recharts). The whole app renders client-side
 * (see <NoSSR> in app/layout.tsx), so there's no hydration step — recharts
 * measures the real mounted DOM and its tooltips + enter animations work.
 */

// Explicit, locale-independent month names for tooltip date labels.
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

const tip = {
  contentStyle: {
    background: 'var(--panel, #fff)',
    border: '1px solid var(--line, #ebebe8)',
    borderRadius: 10,
    fontSize: 12,
    boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
  },
  labelStyle: { color: 'var(--faint, #9c9ca2)', marginBottom: 2 },
  itemStyle: { color: 'var(--ink, #1c1c1e)' },
}

/** Shared empty-state placeholder so a data-less card reads as "waiting", not "broken". */
function ChartEmpty({ label, height = 120 }: { label: string; height?: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center" style={{ height }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--line-strong)" strokeWidth="1.5">
        <path d="M3 3v18h18" strokeLinecap="round" />
        <path d="M7 14l3.5-4 3 3L18 8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 2" />
      </svg>
      <span className="text-xs text-faint">{label}</span>
    </div>
  )
}

export function CallsTrend({ data }: { data: DayPoint[] }) {
  if (!data.reduce((s, d) => s + d.count + (d.booked ?? 0), 0)) return <ChartEmpty label="No call activity yet" height={150} />
  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="gCalls" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--amber)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" hide />
        {/* Each Area sets its own `name` ("calls"/"booked"), so the tooltip
            labels itself correctly — no formatter needed (a custom one here
            previously mislabeled both series as "booked"). */}
        <Tooltip {...tip} labelFormatter={(d) => shortDate(String(d))} />
        <Area
          type="monotone"
          dataKey="count"
          name="calls"
          stroke="var(--amber)"
          strokeWidth={2}
          fill="url(#gCalls)"
          activeDot={{ r: 4, strokeWidth: 0 }}
          animationDuration={750}
        />
        <Area
          type="monotone"
          dataKey="booked"
          name="booked"
          stroke="var(--teal)"
          strokeWidth={1.5}
          fill="none"
          strokeDasharray="3 3"
          activeDot={{ r: 3, strokeWidth: 0 }}
          animationDuration={750}
          animationBegin={150}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function OutcomeDonut({ data }: { data: Tally[] }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  const [active, setActive] = useState<string | null>(null)
  if (!total) return <ChartEmpty label="No outcomes recorded yet" />
  return (
    <div className="flex items-center gap-4">
      <PieChart width={120} height={120}>
        <Pie
          data={data}
          dataKey="count"
          nameKey="key"
          innerRadius={38}
          outerRadius={56}
          paddingAngle={2}
          stroke="none"
          animationDuration={700}
          onMouseEnter={(_, i) => setActive(data[i]?.key ?? null)}
          onMouseLeave={() => setActive(null)}
        >
          {data.map((d) => (
            <Cell
              key={d.key}
              fill={OUTCOME_COLOR[d.key] ?? 'var(--faint)'}
              opacity={active && active !== d.key ? 0.4 : 1}
              style={{ transition: 'opacity 0.2s', cursor: 'pointer' }}
            />
          ))}
        </Pie>
        <Tooltip {...tip} formatter={(v: number, n: string) => [v, OUTCOME_LABEL[n] ?? n]} />
      </PieChart>
      <div className="flex-1 space-y-1.5">
        {data.map((d) => (
          <div
            key={d.key}
            className="flex cursor-default items-center gap-2 text-xs transition-opacity"
            style={{ opacity: active && active !== d.key ? 0.45 : 1 }}
            onMouseEnter={() => setActive(d.key)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: OUTCOME_COLOR[d.key] ?? 'var(--faint)' }} />
            <span className="flex-1 text-muted">{OUTCOME_LABEL[d.key] ?? d.key}</span>
            <span className="font-mono text-ink">{Math.round((d.count / Math.max(total, 1)) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function SentimentSplit({ data }: { data: Tally[] }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  const order = ['positive', 'neutral', 'negative']
  const sorted = order.map((k) => data.find((d) => d.key === k) ?? { key: k, count: 0 })
  if (!total) return <ChartEmpty label="No sentiment recorded yet" />
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="key"
          width={64}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted)' }}
          tickFormatter={cap}
        />
        <Tooltip {...tip} cursor={{ fill: 'var(--panel-2)', fillOpacity: 0.7 }} formatter={(v: number) => [v, 'calls']} labelFormatter={cap} />
        <Bar dataKey="count" name="calls" radius={[0, 4, 4, 0]} animationDuration={700} maxBarSize={22}>
          {sorted.map((d) => (
            <Cell key={d.key} fill={SENTIMENT_COLOR[d.key]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
