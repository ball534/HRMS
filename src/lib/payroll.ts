/**
 * Part-time payroll breakdown — splits raw hours into regular, overtime and
 * public-holiday buckets and applies the multipliers for the employee's own
 * country.
 *
 *   Regular (1.0×):  up to `normalDailyHours` on a working day,
 *                    AND up to the weekly regular cap across all working days.
 *   Overtime:        hours over `normalDailyHours` on a working day,
 *                    OR hours over the weekly cap.
 *   PH regular:      up to `normalDailyHours` on a gazetted holiday.
 *   PH overtime:     hours over `normalDailyHours` on a gazetted holiday.
 *
 * The caps and multipliers used to be hardcoded Malaysian Employment Act
 * figures applied unconditionally to Singapore employees too. They now come in
 * as `rules`, resolved per country from the statutory rulebook
 * (src/lib/statutory.ts).
 *
 * ⚠️  The Singapore figures in that rulebook are still the Malaysian ones,
 * carried over so behaviour didn't change silently. They are flagged unverified
 * in the UI and need qualified employment-law review before these numbers are
 * used for real pay.
 *
 * Inputs: an array of approved TimeEntry rows for a date window + user.
 * Output: an aggregated split + computed pay if hourlyRate is provided.
 */

export type EntryInput = {
  workDate: Date | string
  hoursWorked: number
  isPublicHoliday: boolean
}

export type PayrollBreakdown = {
  regularHours: number
  overtimeHours: number
  publicHolidayRegularHours: number
  publicHolidayOvertimeHours: number
  totalHours: number
  regularPay: number
  overtimePay: number
  publicHolidayRegularPay: number
  publicHolidayOvertimePay: number
  totalPay: number
}

/**
 * The subset of the statutory rulebook payroll needs. Passed in rather than
 * imported so this module stays pure and unit-testable.
 */
export type OvertimeRules = {
  weeklyRegularCap: number
  overtimeMultiplier: number
  publicHolidayMultiplier: number
  publicHolidayOvertimeMultiplier: number
}

/**
 * Used only when a caller doesn't supply rules. Matches the previous hardcoded
 * behaviour so an un-migrated call site doesn't silently change figures — but
 * every real call site should pass the employee's country rules.
 */
const FALLBACK_RULES: OvertimeRules = {
  weeklyRegularCap: 45,
  overtimeMultiplier: 1.5,
  publicHolidayMultiplier: 2,
  publicHolidayOvertimeMultiplier: 3,
}

function isoWeekKey(d: Date): string {
  // YYYY-Www (rough ISO week — sufficient for grouping; uses UTC year-month-day arithmetic).
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export function computePayroll(
  entries: EntryInput[],
  opts: { normalDailyHours: number; hourlyRate?: number; rules?: OvertimeRules },
): PayrollBreakdown {
  const dailyCap = opts.normalDailyHours
  const rate = opts.hourlyRate ?? 0
  const rules = opts.rules ?? FALLBACK_RULES
  const WEEKLY_REGULAR_CAP = rules.weeklyRegularCap

  // Per-day split first (PH vs working day, day-OT threshold)
  let regularHours = 0
  let overtimeHours = 0
  let publicHolidayRegularHours = 0
  let publicHolidayOvertimeHours = 0

  // Track running weekly regular total to apply the 45h cap as the
  // *secondary* overtime trigger (an hour that's regular by day-rule
  // but pushes weekly past 45 becomes OT).
  const weekRegularTotals = new Map<string, number>()

  for (const e of entries) {
    const date = new Date(e.workDate)
    const wk = isoWeekKey(date)
    const hrs = Number(e.hoursWorked)

    if (e.isPublicHoliday) {
      // PH split — never counted toward weekly regular cap, separate bucket
      const phReg = Math.min(hrs, dailyCap)
      const phOt = Math.max(0, hrs - dailyCap)
      publicHolidayRegularHours += phReg
      publicHolidayOvertimeHours += phOt
      continue
    }

    // Working day: split into day-regular + day-OT first
    const dayRegular = Math.min(hrs, dailyCap)
    const dayOt = Math.max(0, hrs - dailyCap)

    // Then re-classify any "regular" that pushes weekly past 45 as OT
    const weekSoFar = weekRegularTotals.get(wk) ?? 0
    const roomLeftInWeek = Math.max(0, WEEKLY_REGULAR_CAP - weekSoFar)
    const dayRegularCappedToWeek = Math.min(dayRegular, roomLeftInWeek)
    const weekOverflow = dayRegular - dayRegularCappedToWeek

    regularHours += dayRegularCappedToWeek
    overtimeHours += dayOt + weekOverflow

    weekRegularTotals.set(wk, weekSoFar + dayRegularCappedToWeek)
  }

  const totalHours =
    regularHours + overtimeHours + publicHolidayRegularHours + publicHolidayOvertimeHours

  const regularPay = regularHours * rate
  const overtimePay = overtimeHours * rate * rules.overtimeMultiplier
  const publicHolidayRegularPay = publicHolidayRegularHours * rate * rules.publicHolidayMultiplier
  const publicHolidayOvertimePay =
    publicHolidayOvertimeHours * rate * rules.publicHolidayOvertimeMultiplier
  const totalPay =
    regularPay + overtimePay + publicHolidayRegularPay + publicHolidayOvertimePay

  return {
    regularHours,
    overtimeHours,
    publicHolidayRegularHours,
    publicHolidayOvertimeHours,
    totalHours,
    regularPay,
    overtimePay,
    publicHolidayRegularPay,
    publicHolidayOvertimePay,
    totalPay,
  }
}

/** Convenience: start/end of an ISO week (Mon–Sun) for a given Date, UTC. */
export function weekBounds(reference: Date): { start: Date; end: Date } {
  const d = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()))
  const day = d.getUTCDay() || 7 // 1..7 (Mon=1)
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - (day - 1))
  monday.setUTCHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  sunday.setUTCHours(23, 59, 59, 999)
  return { start: monday, end: sunday }
}

/** First and last instant of a month (UTC). */
export function monthBounds(year: number, monthIndex: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0))
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1)
  return { start, end }
}
