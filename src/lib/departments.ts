/**
 * The department list.
 *
 * Department used to be a free-text box, which is why the same team appears in
 * the demo data as "Retail", "retail" and "Retail Ops". That is tolerable when
 * a department is only a label on a profile, and not tolerable now that three
 * different decisions read it: which terms an employment letter is drafted from,
 * who signs that letter by default, and who gets the retail Learning Hub.
 *
 * Kept as a plain string on `User` rather than an enum, so an existing record
 * with an unrecognised department keeps working (it just won't match any of the
 * rules below) and adding a department needs no migration.
 */

export const DEPARTMENTS = [
  'Marketing',
  'Retail',
  'Retail Operations',
  'Logistics',
  'Finance',
  'HR',
  'Design',
  'Merchandising',
  'HQ',
] as const

export type Department = (typeof DEPARTMENTS)[number]

/** Case- and spacing-tolerant match against the list above. */
export function normaliseDepartment(value: string | null | undefined): Department | null {
  if (!value) return null
  const cleaned = value.trim().toLowerCase()
  return DEPARTMENTS.find(d => d.toLowerCase() === cleaned) ?? null
}

/**
 * Retail floor staff — the only department the Learning Hub is for.
 *
 * Retail Operations is deliberately excluded: the onboarding course teaches
 * shop-floor work, and the operations team supports stores rather than working
 * in them. `isRetailLetterTerms` below is the wider test, because the retail
 * employment terms do cover both.
 */
export function isRetailLearner(department: string | null | undefined): boolean {
  return normaliseDepartment(department) === 'Retail'
}

/** Retail and Retail Operations share one set of employment terms. */
export function isRetailLetterTerms(department: string | null | undefined): boolean {
  const d = normaliseDepartment(department)
  return d === 'Retail' || d === 'Retail Operations'
}

/** Logistics part-timers are paid on three day-type rates rather than two. */
export function isLogistics(department: string | null | undefined): boolean {
  return normaliseDepartment(department) === 'Logistics'
}
