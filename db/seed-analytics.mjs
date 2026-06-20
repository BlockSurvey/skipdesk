/**
 * Generates rich transactional analytics data (calls, appointments, leads) for a
 * business so its dashboard has meaningful data to show. Writes db/seed-analytics.sql.
 *   node db/seed-analytics.mjs > db/seed-analytics.sql
 *   wrangler d1 execute skip-desk-db --remote --file db/seed-analytics.sql
 *
 * Defaults to the demo clinic; override per business via env:
 *   BIZ_ID=<uuid> TZ_NAME=Asia/Kolkata TZ_OFFSET=+05:30 SERVICES='A|B|C' node db/seed-analytics.mjs
 */
import { randomUUID } from 'node:crypto'

const BIZ = process.env.BIZ_ID ?? 'd53a9e4e-d775-4765-8bcd-bbdd8f8276cb' // demo clinic (mirrors db/seed.sql)
const TZ_NAME = process.env.TZ_NAME ?? 'Asia/Kolkata'
const TZ_OFFSET = process.env.TZ_OFFSET ?? '+05:30' // Asia/Kolkata

const pick = (a) => a[Math.floor(Math.random() * a.length)]
const wpick = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v }
  return pairs[0][0]
}
const sq = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`)

const FIRST = ['Aarav', 'Diya', 'Vivaan', 'Ananya', 'Aditya', 'Ishaan', 'Saanvi', 'Kabir', 'Myra', 'Reyansh', 'Anika', 'Arjun', 'Riya', 'Vihaan', 'Pari', 'Rohan', 'Aisha', 'Karan', 'Neha', 'Dev']
const LAST = ['Sharma', 'Iyer', 'Patel', 'Nair', 'Reddy', 'Gupta', 'Menon', 'Khan', 'Rao', 'Das']
const SERVICES = process.env.SERVICES
  ? process.env.SERVICES.split('|')
  : ['General consultation', 'Pediatric check-up', 'Dermatology consult', 'Routine diagnostics', 'Follow-up visit', 'Vaccination']
const INTENTS = ['book appointment', 'reschedule', 'opening hours', 'directions', 'insurance question', 'prescription refill', 'test results', 'specialist referral']
const phone = () => `+9198${Math.floor(10000000 + Math.random() * 89999999)}`
const name = () => `${pick(FIRST)} ${pick(LAST)}`

const iso = (d) => d.toISOString()
const daysAgo = (n, h = 10, m = 0) => {
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, m, 0, 0); return d
}
// A weekday within +/- range; returns Date at given Kolkata local hour as UTC.
function apptUtc(dayOffset, hour, minute) {
  const d = new Date(); d.setDate(d.getDate() + dayOffset)
  const yyyy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return new Date(`${yyyy}-${mm}-${dd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${TZ_OFFSET}`)
}

const rows = []
rows.push('-- Demo analytics data for the Sunrise clinic. Regenerate: node db/seed-analytics.mjs > db/seed-analytics.sql')
rows.push(`DELETE FROM calls WHERE business_id='${BIZ}';`)
rows.push(`DELETE FROM appointments WHERE business_id='${BIZ}';`)
rows.push(`DELETE FROM leads WHERE business_id='${BIZ}';`)

// ── 50 calls across the last 30 days ─────────────────────────────────────────
for (let i = 0; i < 50; i++) {
  const dayBack = Math.floor(Math.random() * 30)
  const start = daysAgo(dayBack, 9 + Math.floor(Math.random() * 8), pick([0, 15, 30, 45]))
  const dur = 40 + Math.floor(Math.random() * 360)
  const outcome = wpick([['info_provided', 30], ['appointment_booked', 28], ['lead_captured', 14], ['escalated', 10], ['transferred', 6], ['abandoned', 12]])
  const sentiment = wpick([['positive', 52], ['neutral', 33], ['negative', 15]])
  const intent = pick(INTENTS)
  const caller = phone()
  const summary = `Caller asked about ${intent}. ${outcome === 'appointment_booked' ? 'Booked a slot.' : outcome === 'escalated' ? 'Escalated to front office.' : outcome === 'lead_captured' ? 'Captured details for follow-up.' : 'Provided the information requested.'}`
  rows.push(
    `INSERT INTO calls (id,business_id,caller_number,direction,started_at,ended_at,duration_seconds,outcome,intent,sentiment,summary,created_at,updated_at) VALUES ` +
    `(${sq(randomUUID())},${sq(BIZ)},${sq(caller)},'inbound',${sq(iso(start))},${sq(iso(new Date(start.getTime() + dur * 1000)))},${dur},${sq(outcome)},${sq(intent)},${sq(sentiment)},${sq(summary)},${sq(iso(start))},${sq(iso(start))});`,
  )
}

// ── 34 appointments: ~20 upcoming (next 14d), ~14 past (last 21d) ────────────
for (let i = 0; i < 34; i++) {
  const future = i < 20
  const offset = future ? 1 + Math.floor(Math.random() * 14) : -(1 + Math.floor(Math.random() * 21))
  const hour = 9 + Math.floor(Math.random() * 8)
  const start = apptUtc(offset, hour, pick([0, 30]))
  // skip Sundays (clinic closed) by nudging to Monday
  if (start.getDay() === 0) start.setDate(start.getDate() + 1)
  const end = new Date(start.getTime() + 30 * 60000)
  const status = future ? wpick([['confirmed', 75], ['pending', 25]]) : wpick([['completed', 70], ['cancelled', 18], ['no_show', 12]])
  const nm = name()
  rows.push(
    `INSERT INTO appointments (id,business_id,customer_name,customer_phone,customer_email,service,starts_at,ends_at,timezone,status,location,created_at,updated_at) VALUES ` +
    `(${sq(randomUUID())},${sq(BIZ)},${sq(nm)},${sq(phone())},${sq(nm.toLowerCase().replace(/[^a-z]/g, '.') + '@example.com')},${sq(pick(SERVICES))},${sq(iso(start))},${sq(iso(end))},${sq(TZ_NAME)},${sq(status)},'12 MG Road, Bengaluru',${sq(iso(start))},${sq(iso(start))});`,
  )
}

// ── 24 leads across statuses/urgency ─────────────────────────────────────────
const REASONS = ['Wants a cardiology specialist not on staff', 'Asked for an early-morning slot we did not have', 'Needs a home visit', 'Insurance pre-authorization question', 'Requested a female doctor for next week', 'Complaint about wait time', 'Bulk health check-up for a company', 'Second opinion on a report']
for (let i = 0; i < 24; i++) {
  const created = daysAgo(Math.floor(Math.random() * 25), 9 + Math.floor(Math.random() * 8))
  const status = wpick([['new', 35], ['contacted', 30], ['scheduled', 20], ['closed', 15]])
  const urgency = wpick([['normal', 55], ['high', 25], ['low', 20]])
  const esc = urgency === 'high' && Math.random() < 0.6 ? 1 : 0
  const nm = name()
  rows.push(
    `INSERT INTO leads (id,business_id,full_name,phone,email,reason,urgency,status,escalated,created_at,updated_at) VALUES ` +
    `(${sq(randomUUID())},${sq(BIZ)},${sq(nm)},${sq(phone())},${sq(nm.toLowerCase().replace(/[^a-z]/g, '.') + '@example.com')},${sq(pick(REASONS))},${sq(urgency)},${sq(status)},${esc},${sq(iso(created))},${sq(iso(created))});`,
  )
}

process.stdout.write(rows.join('\n') + '\n')
