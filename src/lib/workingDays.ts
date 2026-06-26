import { eachDayOfInterval, isWeekend } from 'date-fns'

/**
 * Counts working days between startDate and endDate (inclusive),
 * excluding weekends and the provided public holidays.
 *
 * Uses UTC date components for holiday comparison to avoid timezone drift
 * (dates stored as UTC midnight in Postgres would otherwise mismatch when
 * compared via local-timezone startOfDay on servers in UTC+N zones).
 *
 * @param startDate - Start of the range (inclusive)
 * @param endDate   - End of the range (inclusive)
 * @param publicHolidays - Array of holiday Dates (pre-fetched from DB for user's country)
 * @param halfDay   - 'NONE' | 'AM' | 'PM'; reduces count by 0.5 for a single working day,
 *                   or subtracts 0.5 from multi-day ranges
 * @returns Number of working days (may be 0 or a multiple of 0.5)
 */
export function calculateWorkingDays(
  startDate: Date,
  endDate: Date,
  publicHolidays: Date[],
  halfDay: 'NONE' | 'AM' | 'PM' = 'NONE'
): number {
  if (startDate > endDate) return 0

  // Build holiday set using UTC date strings to avoid timezone drift
  const holidaySet = new Set(
    publicHolidays.map(
      d => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
    )
  )

  const days = eachDayOfInterval({ start: startDate, end: endDate })

  const workingDays = days.filter(day => {
    if (isWeekend(day)) return false
    const key = `${day.getUTCFullYear()}-${day.getUTCMonth()}-${day.getUTCDate()}`
    if (holidaySet.has(key)) return false
    return true
  })

  const count = workingDays.length
  if (count === 0) return 0
  // Half-day on single working day = 0.5; multi-day range = count - 0.5
  return halfDay === 'NONE' ? count : count === 1 ? 0.5 : count - 0.5
}
