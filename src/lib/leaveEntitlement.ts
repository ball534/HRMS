import { differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns'

/**
 * The annual-leave portion of a country's statutory rule set. Passed in rather
 * than imported so this module stays pure.
 */
export type AnnualLeaveRules = {
  base: { EMPLOYEE: number; CONTRACTOR: number; PART_TIME: number }
  daysPerYearOfService: number
  maxDays: number
}

/**
 * Used when a caller supplies no rules. Matches the previous hardcoded
 * behaviour except for the cap — see the note on `maxDays` below.
 */
const FALLBACK_ANNUAL_LEAVE: AnnualLeaveRules = {
  base: { EMPLOYEE: 18, CONTRACTOR: 14, PART_TIME: 8 },
  daysPerYearOfService: 1,
  maxDays: 30,
}

/**
 * Calculates the full annual leave entitlement for a user based on employment
 * type and tenure as of Jan 1 of the given year.
 *
 * The figures now come from the per-country statutory rulebook
 * (src/lib/statutory.ts) instead of being hardcoded here. Previously one set of
 * numbers was applied to both Singapore and Malaysia, and the tenure accrual
 * had **no cap at all** — a 20-year employee silently reached 38 days.
 *
 * ⚠️  The rulebook's Singapore values are currently a copy of the Malaysian
 * ones, carried over so behaviour did not change silently. They are flagged
 * unverified in the UI and need qualified employment-law review.
 *
 * Note: HR may override this auto-calculation per-employee by setting
 * `LeaveBalance.entitlementOverride`. See `effectiveEntitlement` below.
 */
export function calculateAnnualEntitlement(
  employmentType: 'EMPLOYEE' | 'CONTRACTOR' | 'PART_TIME',
  startDate: Date,
  forYear: number,
  rules: AnnualLeaveRules = FALLBACK_ANNUAL_LEAVE
): number {
  const base = rules.base[employmentType] ?? rules.base.EMPLOYEE
  const jan1 = new Date(forYear, 0, 1)
  const yearsOfTenure = Math.floor(differenceInCalendarDays(jan1, startDate) / 365)
  const accrued = base + Math.max(0, yearsOfTenure) * rules.daysPerYearOfService
  return Math.min(accrued, rules.maxDays)
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
function effectiveCarryForward(
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
function effectiveEntitlement(
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
