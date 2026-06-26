import { differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns'

/**
 * Calculates the full annual leave entitlement for a user based on employment
 * type and tenure as of Jan 1 of the given year.
 *
 * Business rules:
 * - Employee base: 18 days
 * - Contractor base: 14 days
 * - Part-time base: 8 days (statutory floor under SG/MY part-time regulations;
 *   pro-rated further by hours worked downstream where applicable)
 * - +1 day per completed year of tenure (no cap)
 *
 * Note: HR may override this auto-calculation per-employee by setting
 * `LeaveBalance.entitlementOverride`. See `effectiveEntitlement` below.
 */
export function calculateAnnualEntitlement(
  employmentType: 'EMPLOYEE' | 'CONTRACTOR' | 'PART_TIME',
  startDate: Date,
  forYear: number
): number {
  const base =
    employmentType === 'EMPLOYEE' ? 18 : employmentType === 'PART_TIME' ? 8 : 14
  const jan1 = new Date(forYear, 0, 1)
  const yearsOfTenure = Math.floor(differenceInCalendarDays(jan1, startDate) / 365)
  return base + Math.max(0, yearsOfTenure)
}

/**
 * Applies pro-rata reduction for users who joined mid-year.
 */
export function calculateProRataEntitlement(
  fullEntitlement: number,
  startDate: Date,
  forYear: number
): number {
  if (startDate.getFullYear() < forYear) return fullEntitlement
  const dec31 = new Date(forYear, 11, 31)
  const monthsRemaining = differenceInCalendarMonths(dec31, startDate) + 1
  const capped = Math.min(monthsRemaining, 12)
  return Math.floor((fullEntitlement * capped) / 12 * 2) / 2
}

// ============================================================
// Carry-forward expiry (HR rule: unused days carry to next year
// but expire on March 31 of that year)
// ============================================================

/**
 * March 31 of the given year, at end-of-day local time.
 * Carry-forward from year-1 expires at the end of this day.
 */
export function carryForwardExpiryFor(year: number): Date {
  return new Date(year, 2, 31, 23, 59, 59, 999) // month 2 = March
}

/**
 * Compute the carryover that has not yet expired.
 * If `now` is past the expiry date, return 0 — the carryover is dead.
 */
export function effectiveCarryForward(
  carryForward: number,
  carryForwardExpiresAt: Date | null,
  now: Date = new Date()
): number {
  if (!carryForwardExpiresAt) return carryForward
  if (now.getTime() > carryForwardExpiresAt.getTime()) return 0
  return carryForward
}

/**
 * Pick the authoritative base entitlement: HR's manual override (if set)
 * trumps the auto-calculated value.
 */
export function effectiveEntitlement(
  entitlement: number,
  entitlementOverride: number | null
): number {
  return entitlementOverride ?? entitlement
}

/**
 * Compute available days using all the rules above.
 * available = effectiveEntitlement + activeCarry + adjustment - used - pending
 *
 * Where "activeCarry" is 0 after the expiry date.
 * Note: this DOES NOT mutate the DB row. After expiry, "used" still reflects
 * total days taken (including any that came from carry while it was active);
 * the math works out because carry was always "free" extra days — when it
 * expires, what's gone is the unused portion, not the spent portion.
 *
 * Example: ent=12, carry=2, used=5, adj=0, pending=0
 *   - Before expiry: available = 12 + 2 + 0 - 5 - 0 = 9
 *   - After expiry:  available = 12 + 0 + 0 - 5 - 0 = 7  ❌ (wrong, see below)
 *
 * The trick: AFTER expiry, the "spent carry" portion of `used` should not
 * count against base. We handle this by calling `applyCarryForwardExpiry`
 * on first access after the expiry date — it subtracts `min(used, carry)`
 * from used and zeroes carry, so the available formula stays simple.
 */
export function computeAvailable(b: {
  entitlement: number
  entitlementOverride: number | null
  carryForward: number
  carryForwardExpiresAt: Date | null
  adjustment: number
  used: number
  pending: number
}, now: Date = new Date()): number {
  const ent = effectiveEntitlement(b.entitlement, b.entitlementOverride)
  const carry = effectiveCarryForward(b.carryForward, b.carryForwardExpiresAt, now)
  return ent + carry + b.adjustment - b.used - b.pending
}

/**
 * If carry-forward has expired, derive the post-expiry balance state.
 * After expiry: `used` is reduced by min(used, carryForward) so it counts
 * only against base going forward, and carryForward + carryForwardExpiresAt
 * are cleared.
 *
 * Returns the next-state values; caller persists them. Returns null if no
 * change is needed (carry already zero, not yet expired, etc.).
 */
export function applyCarryForwardExpiry(b: {
  used: number
  carryForward: number
  carryForwardExpiresAt: Date | null
}, now: Date = new Date()): {
  used: number
  carryForward: number
  carryForwardExpiresAt: Date | null
} | null {
  if (!b.carryForwardExpiresAt) return null
  if (b.carryForward <= 0) return null
  if (now.getTime() <= b.carryForwardExpiresAt.getTime()) return null

  const spentFromCarry = Math.min(b.used, b.carryForward)
  return {
    used: b.used - spentFromCarry,
    carryForward: 0,
    carryForwardExpiresAt: null,
  }
}
