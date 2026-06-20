// Canonical SkipDesk ICP (Ideal Customer Profile) — single source of truth.
//
// SkipDesk is for appointment-driven local service businesses that lose revenue
// when the phone goes unanswered: high call volume, bookings or consultations
// on the line, small teams that can't always pick up. Every vertical below is
// phone- and appointment-led, which is exactly where an AI front desk pays off.
//
// Use these lists everywhere the ICP appears — do NOT redefine business-type
// lists inline:
//   • INDUSTRY_OPTIONS — the onboarding + settings "Industry" picker
//   • ICP_MARKETING   — the landing-page audience ribbon
// Keeping both derived from this one file is what stops them drifting apart.

/**
 * Industry categories an owner selects during onboarding and can edit in
 * settings. Best-fit verticals first; 'Other' is the catch-all. The selected
 * string is stored verbatim in `businesses.industry`.
 */
export const INDUSTRY_OPTIONS: readonly string[] = [
  'Dental & orthodontics',
  'Aesthetics & skin clinic',
  'Medical & specialty clinic',
  'Physiotherapy & chiropractic',
  'Salon & barbershop',
  'Spa & wellness',
  'Fitness & yoga studio',
  'Veterinary',
  'Home services',
  'Auto services',
  'Professional services',
  'Real estate',
  'Other',
]

/**
 * The same ICP phrased for marketing — used in the landing-page scrolling
 * ribbon. Plural and evocative, and excludes the 'Other' catch-all.
 */
export const ICP_MARKETING: readonly string[] = [
  'Dental practices',
  'Aesthetics & skin clinics',
  'Salons & barbershops',
  'Spas & wellness',
  'Physiotherapy & chiropractic',
  'Fitness & yoga studios',
  'Veterinary clinics',
  'Home services',
  'Auto repair shops',
  'Professional services',
  'Real estate teams',
]
