import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { businessFaqs, businessHours, businesses } from '../../../../db/schema'
import type { Registrar } from '../context'
import { ok } from '../lib/respond'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function registerInfoTools(def: Registrar): void {
  def(
    'get_business_info',
    "Look up this business's hours, services, and FAQ answers so you can tell the caller. Optionally pass a topic (e.g. 'hours', 'parking', 'services') to filter. Use this for any informational question.",
    { topic: z.string().optional() },
    'info:read',
    async ({ topic }, ctx) => {
      const biz = await ctx.db.query.businesses.findFirst({ where: eq(businesses.id, ctx.businessId) })
      const faqs = await ctx.db.query.businessFaqs.findMany({
        where: and(eq(businessFaqs.businessId, ctx.businessId), eq(businessFaqs.isActive, true)),
      })
      const hours = await ctx.db.query.businessHours.findMany({
        where: eq(businessHours.businessId, ctx.businessId),
      })

      let matched = faqs
      if (topic) {
        const t = topic.toLowerCase()
        const hits = faqs.filter(
          (f) =>
            f.question.toLowerCase().includes(t) ||
            f.answer.toLowerCase().includes(t) ||
            (f.tags ?? '').toLowerCase().includes(t),
        )
        if (hits.length) matched = hits
      }

      return ok({
        business: biz ? { name: biz.name, timezone: biz.timezone } : null,
        hours: hours
          .slice()
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
          .map((h) => ({
            day: DOW[h.dayOfWeek],
            closed: h.closed,
            open: h.closed ? null : h.openTime,
            close: h.closed ? null : h.closeTime,
          })),
        faqs: matched.map((f) => ({ question: f.question, answer: f.answer })),
      })
    },
  )
}
