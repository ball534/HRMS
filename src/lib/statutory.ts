import 'server-only'

import { cache } from 'react'
import { z } from 'zod'
import { db } from '@/lib/db'
import type { Country } from '@/generated/prisma/client'

/**
 * The statutory rulebook — per-country employment rules, versioned by
 * effective date.
 *
 * ⚠️  IMPORTANT — READ BEFORE RELYING ON THESE NUMBERS
 *
 * The values seeded below are **carried over verbatim from what the code did
 * before this module existed**, which was to apply one rulebook (drawn from the
 * Malaysian Employment Act) to both Singapore and Malaysia. They are a faithful
 * record of current behaviour, NOT legal advice, and they have NOT been checked
 * against Singapore's Employment Act or against current Malaysian law.
 *
 * In particular, the Singapore overtime figures below are the Malaysian ones.
 * They are structurally separated now — so they *can* be corrected without a
 * code change — but they are still wrong until somebody qualified corrects them.
 *
 * Every rule set carries `verifiedBy`/`verifiedAt`. Until an employment-law
 * adviser has signed a set off and HR has recorded that here, the app shows an
 * "unverified" banner on every screen whose figures depend on it. Do not remove
 * that banner as a tidy-up; it is load-bearing.
 *
 * Why versioned by effective date: a rule change must not retroactively rewrite
 * a payroll figure or leave entitlement that was already calculated and paid.
 * `resolveRules(country, asOf)` returns the set that was in force on `asOf`.
 */

// ============================================================
// Shape
// ============================================================

export const statutoryRulesSchema = z.object({
  annualLeave: z.object({
    /** Base days by employment type, before tenure accrual. */
    base: z.object({
      EMPLOYEE: z.number().min(0).max(365),
      CONTRACTOR: z.number().min(0).max(365),
      PART_TIME: z.number().min(0).max(365),
    }),
    /** Extra days granted per completed year of service. */
    daysPerYearOfService: z.number().min(0).max(10),
    /**
     * Ceiling on total entitlement. Before this existed the accrual was
     * uncapped, so a 20-year employee silently reached 38 days.
     */
    maxDays: z.number().min(0).max(365),
  }),
  sickLeave: z.object({
    /** Outpatient sick-leave days. Bands by tenure where the law sets them. */
    outpatientDays: z.number().min(0).max(365),
    /** Days available when hospitalised (usually inclusive of outpatient). */
    hospitalisationDays: z.number().min(0).max(365),
    /**
     * Optional tenure banding, e.g. Malaysia grants more days with longer
     * service. Empty means a flat entitlement.
     */
    tenureBands: z
      .array(
        z.object({
          minYearsOfService: z.number().min(0),
          outpatientDays: z.number().min(0).max(365),
          hospitalisationDays: z.number().min(0).max(365),
        }),
      )
      .default([]),
  }),
  overtime: z.object({
    /** Hours per week beyond which work counts as overtime. */
    weeklyRegularCap: z.number().min(1).max(168),
    /** Multiplier on a normal working day beyond normal daily hours. */
    overtimeMultiplier: z.number().min(1).max(5),
    /** Multiplier for hours worked on a gazetted public holiday. */
    publicHolidayMultiplier: z.number().min(1).max(5),
    /** Multiplier for overtime hours on a gazetted public holiday. */
    publicHolidayOvertimeMultiplier: z.number().min(1).max(5),
  }),
  /** Free-text note carried with the set, e.g. the statute it derives from. */
  sourceNote: z.string().max(500).optional(),
})

export type StatutoryRules = z.infer<typeof statutoryRulesSchema>

// ============================================================
// Baseline
// ============================================================

/**
 * Malaysia — the rulebook the code has actually been applying, to both
 * countries.
 *
 * Derived from the Employment Act 1955 (as amended 2022) as it was implemented
 * in `src/lib/payroll.ts` and `src/lib/leaveEntitlement.ts`. Unverified.
 */
const MY_BASELINE: StatutoryRules = {
  annualLeave: {
    base: { EMPLOYEE: 18, CONTRACTOR: 14, PART_TIME: 8 },
    daysPerYearOfService: 1,
    // The previous implementation had no cap at all. 30 is a deliberate,
    // conservative ceiling so the number stops growing without bound; it is a
    // company policy choice, not a statutory figure, and needs confirming.
    maxDays: 30,
  },
  sickLeave: {
    outpatientDays: 14,
    hospitalisationDays: 60,
    // Malaysian sick leave is banded by service length. These bands were never
    // modelled in the code; the shape is here so they can be entered, but the
    // figures must be confirmed before they are relied on.
    tenureBands: [],
  },
  overtime: {
    weeklyRegularCap: 45,
    overtimeMultiplier: 1.5,
    publicHolidayMultiplier: 2,
    publicHolidayOvertimeMultiplier: 3,
  },
  sourceNote:
    'Carried over from the pre-existing single-rulebook implementation (Employment Act 1955, as amended 2022). NOT verified.',
}

/**
 * Singapore — currently a copy of the Malaysian figures.
 *
 * This is deliberate and it is not a claim about Singapore law. The code was
 * applying the Malaysian rulebook to Singapore employees; copying it here keeps
 * behaviour identical while making the wrongness visible and fixable. The
 * Employment Act (Singapore) figures — the weekly hours threshold, the overtime
 * multiplier, and outpatient/hospitalisation sick-leave entitlements — differ
 * and must be entered by someone qualified before this is used for real pay.
 */
const SG_BASELINE: StatutoryRules = {
  ...MY_BASELINE,
  sourceNote:
    'PLACEHOLDER — these are the Malaysian figures the code was already applying to Singapore employees. Singapore Employment Act values must be confirmed by a qualified adviser and entered here.',
}

export const BASELINE_RULES: Record<Country, StatutoryRules> = {
  SG: SG_BASELINE,
  MY: MY_BASELINE,
}

/** The date the baseline is treated as effective from. */
export const BASELINE_EFFECTIVE_FROM = new Date(Date.UTC(2000, 0, 1))

// ============================================================
// Resolution
// ============================================================

export type ResolvedRules = {
  rules: StatutoryRules
  /** Null when falling back to the code baseline (no row in the database). */
  ruleSetId: string | null
  effectiveFrom: Date
  /** False until an adviser sign-off has been recorded. Drives the UI banner. */
  verified: boolean
  verifiedAt: Date | null
  verifiedNote: string | null
}

const loadSets = cache(async () => {
  try {
    return await db.statutoryRuleSet.findMany({ orderBy: { effectiveFrom: 'desc' } })
  } catch (err) {
    console.error('[statutory] could not load rule sets, using code baseline:', err)
    return []
  }
})

/**
 * The rules in force for `country` on `asOf` (default: now).
 *
 * Falls back to the code baseline when no rule set exists, so the app works on
 * a database that has never been seeded — and so that removing every row can't
 * leave payroll with no multipliers at all.
 */
export async function resolveRules(country: Country, asOf: Date = new Date()): Promise<ResolvedRules> {
  const sets = await loadSets()

  const match = sets.find(s => s.country === country && s.effectiveFrom <= asOf)

  if (!match) {
    return {
      rules: BASELINE_RULES[country],
      ruleSetId: null,
      effectiveFrom: BASELINE_EFFECTIVE_FROM,
      verified: false,
      verifiedAt: null,
      verifiedNote: null,
    }
  }

  const parsed = statutoryRulesSchema.safeParse(match.rules)
  if (!parsed.success) {
    console.error(
      `[statutory] rule set ${match.id} (${country}) is malformed, using code baseline`,
      parsed.error.issues,
    )
    return {
      rules: BASELINE_RULES[country],
      ruleSetId: null,
      effectiveFrom: BASELINE_EFFECTIVE_FROM,
      verified: false,
      verifiedAt: null,
      verifiedNote: null,
    }
  }

  return {
    rules: parsed.data,
    ruleSetId: match.id,
    effectiveFrom: match.effectiveFrom,
    verified: match.verifiedBy !== null,
    verifiedAt: match.verifiedAt,
    verifiedNote: match.verifiedNote,
  }
}

/** Every rule set, newest first — for the admin screen. */
export async function listRuleSets() {
  return db.statutoryRuleSet.findMany({ orderBy: [{ country: 'asc' }, { effectiveFrom: 'desc' }] })
}

/**
 * True when any country's rules in force today are unverified — used to decide
 * whether to show the banner on payroll and leave screens.
 */
export async function hasUnverifiedRules(): Promise<boolean> {
  const [sg, my] = await Promise.all([resolveRules('SG'), resolveRules('MY')])
  return !sg.verified || !my.verified
}
