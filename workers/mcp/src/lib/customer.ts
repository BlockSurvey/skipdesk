/**
 * Caller identity resolution — the single place a caller becomes (or is matched
 * to) a CRM contact. A contact is a `leads` row, unique per (business, phone).
 *
 * `resolveContact` is idempotent on phone: call it as many times as you like for
 * the same number and you get the one existing record back (created once). This
 * is what guarantees "store the caller if not found" and "reuse the existing
 * record" — names can collide, phones don't.
 */
import { and, desc, eq } from 'drizzle-orm'

import type { Db } from '../../../../db/client'
import { businesses, leads } from '../../../../db/schema'
import { countryCodeForTimezone } from './validate'

export type Contact = typeof leads.$inferSelect

/** Default country code for a business (so bare local numbers normalize correctly). */
export async function businessCountryCode(db: Db, businessId: string): Promise<string | null> {
  const biz = await db.query.businesses.findFirst({ where: eq(businesses.id, businessId) })
  return countryCodeForTimezone(biz?.timezone)
}

export async function resolveContact(
  db: Db,
  businessId: string,
  info: { phone: string; name?: string; email?: string | null; callId?: string | null },
): Promise<{ contact: Contact; created: boolean }> {
  const existing = await db.query.leads.findFirst({
    where: and(eq(leads.businessId, businessId), eq(leads.phone, info.phone)),
    orderBy: desc(leads.createdAt),
  })

  if (existing) {
    // Back-fill identity we didn't have before; never overwrite an established name.
    const patch: Partial<Contact> = { updatedAt: new Date().toISOString() }
    if ((!existing.fullName || existing.fullName === 'Unknown caller') && info.name) patch.fullName = info.name
    if (!existing.email && info.email) patch.email = info.email
    const [updated] = await db.update(leads).set(patch).where(eq(leads.id, existing.id)).returning()
    return { contact: updated ?? existing, created: false }
  }

  const [created] = await db
    .insert(leads)
    .values({
      businessId,
      callId: info.callId ?? null,
      fullName: info.name ?? 'Unknown caller',
      phone: info.phone,
      email: info.email ?? null,
      status: 'new',
    })
    .returning()
  return { contact: created!, created: true }
}
