'use client'

import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { DayPoint, Tally } from '@/lib/api'
import { OUTCOME_COLOR, OUTCOME_LABEL, SENTIMENT_COLOR } from '@/lib/format'

const tip = {
  contentStyle: { background: '#ffffff', border: '1px solid #ebebe8', borderRadius: 10, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' },
  labelStyle: { color: '#9c9ca2' },
  itemStyle: { color: '#1c1c1e' },
}

export function CallsTrend({ data }: { data: DayPoint[] }) {
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
        <Tooltip {...tip} labelFormatter={(d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} />
        <Area type="monotone" dataKey="count" name="calls" stroke="var(--amber)" strokeWidth={2} fill="url(#gCalls)" />
        <Area type="monotone" dataKey="booked" name="booked" stroke="var(--teal)" strokeWidth={1.5} fill="none" strokeDasharray="3 3" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function OutcomeDonut({ data }: { data: Tally[] }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={120} height={120}>
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="key" innerRadius={38} outerRadius={56} paddingAngle={2} stroke="none">
            {data.map((d) => (
              <Cell key={d.key} fill={OUTCOME_COLOR[d.key] ?? 'var(--faint)'} />
            ))}
          </Pie>
          <Tooltip {...tip} formatter={(v: number, n: string) => [v, OUTCOME_LABEL[n] ?? n]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1.5">
        {data.map((d) => (
          <div key={d.key} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: OUTCOME_COLOR[d.key] ?? 'var(--faint)' }} />
            <span className="flex-1 text-muted">{OUTCOME_LABEL[d.key] ?? d.key}</span>
            <span className="font-mono text-ink">{Math.round((d.count / Math.max(total, 1)) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SentimentSplit({ data }: { data: Tally[] }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  const order = ['positive', 'neutral', 'negative']
  const sorted = order.map((k) => data.find((d) => d.key === k) ?? { key: k, count: 0 })
  return (
    <div className="space-y-3">
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {sorted.map((d) => (
          <div key={d.key} style={{ width: `${(d.count / Math.max(total, 1)) * 100}%`, background: SENTIMENT_COLOR[d.key] }} />
        ))}
      </div>
      <div className="flex justify-between">
        {sorted.map((d) => (
          <div key={d.key} className="text-center">
            <div className="font-mono text-lg text-ink">{d.count}</div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-faint">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: SENTIMENT_COLOR[d.key] }} />
              {d.key}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
