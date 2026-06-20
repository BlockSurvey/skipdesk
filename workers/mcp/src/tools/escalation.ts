import { asc, eq } from 'drizzle-orm'

import { escalationContacts } from '../../../../db/schema'
import type { Registrar } from '../context'
import { ok } from '../lib/respond'

export function registerEscalationTools(def: Registrar): void {
  def(
    'get_escalation_contact',
    'Get the staff member(s) to transfer to or escalate a request to, ordered by priority (lowest number = contacted first). Use when the caller asks for a human or the request needs staff follow-up.',
    {},
    'info:read',
    async (_args, ctx) => {
      const contacts = await ctx.db.query.escalationContacts.findMany({
        where: eq(escalationContacts.businessId, ctx.businessId),
        orderBy: asc(escalationContacts.priority),
      })
      return ok({
        primary: contacts[0]
          ? { name: contacts[0].name, role: contacts[0].role, phone: contacts[0].phone, email: contacts[0].email }
          : null,
        all: contacts.map((c) => ({ name: c.name, role: c.role, phone: c.phone, email: c.email, priority: c.priority })),
      })
    },
  )
}
