'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireCapability } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import {
  BASELINE_RULES,
  resolveRules,
  statutoryRulesSchema,
  type StatutoryRules,
} from '@/lib/statutory'
import type { Country } from '@/generated/prisma/client'

export type StatutoryActionState = { success?: boolean; error?: string }

export type RuleSetRow = {
  id: string
  country: Country
  effectiveFrom: string
  rules: StatutoryRules
  note: string | null
  createdByName: string | null
  createdAt: string
  verified: boolean
  verifiedByName: string | null
  verifiedAt: string | null
  verifiedNote: string | null
  /** True for the set currently in force for its country. */
  inForce: boolean
}

/**
 * Every rule set plus the current baseline, for the admin screen.
 *
 * When a country has no stored rule set at all, a synthetic row is returned
 * describing the code baseline so HR can see what is actually being applied
 * rather than an empty table.
 */
export async function getStatutoryRuleSets(): Promise<{
  rows: RuleSetRow[]
  baseline: Record<Country, StatutoryRules>
  missingCountries: Country[]
}> {
  await requireCapability('statutory.write')

  const sets = await db.statutoryRuleSet.findMany({
    orderBy: [{ country: 'asc' }, { effectiveFrom: 'desc' }],
  })

  const userIds = [
    ...sets.map(s => s.createdBy),
    ...sets.map(s => s.verifiedBy),
  ].filter((v): v is string => !!v)

  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : []
  const nameOf = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]))

  const [sgInForce, myInForce] = await Promise.all([resolveRules('SG'), resolveRules('MY')])
  const inForceIds = new Set([sgInForce.ruleSetId, myInForce.ruleSetId].filter(Boolean))

  const rows: RuleSetRow[] = sets.map(s => ({
    id: s.id,
    country: s.country,
    effectiveFrom: s.effectiveFrom.toISOString().slice(0, 10),
    rules: statutoryRulesSchema.parse(s.rules),
    note: s.note,
    createdByName: s.createdBy ? (nameOf.get(s.createdBy) ?? 'Unknown') : null,
    createdAt: s.createdAt.toISOString(),
    verified: s.verifiedBy !== null,
    verifiedByName: s.verifiedBy ? (nameOf.get(s.verifiedBy) ?? 'Unknown') : null,
    verifiedAt: s.verifiedAt ? s.verifiedAt.toISOString() : null,
    verifiedNote: s.verifiedNote,
    inForce: inForceIds.has(s.id),
  }))

  const missingCountries = (['SG', 'MY'] as Country[]).filter(
    c => !sets.some(s => s.country === c),
  )

  return { rows, baseline: BASELINE_RULES, missingCountries }
}

const createSchema = z.object({
  country: z.enum(['SG', 'MY']),
  effectiveFrom: z.string().min(1),
  note: z.string().max(500).optional(),
  rules: statutoryRulesSchema,
})

/**
 * Create a new version of a country's rules.
 *
 * Always a new row with its own `effectiveFrom`, never an edit in place —
 * otherwise changing a multiplier would retroactively alter payroll figures
 * that were already calculated and paid.
 *
 * A new set is always unverified, including when it is derived from a verified
 * one: changed numbers need fresh sign-off.
 */
export async function createStatutoryRuleSet(input: {
  country: 'SG' | 'MY'
  effectiveFrom: string
  note?: string
  rules: unknown
}): Promise<StatutoryActionState> {
  try {
    const session = await requireCapability('statutory.write')

    const parsed = createSchema.safeParse(input)
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid rule values' }
    }
    const data = parsed.data
    const effectiveFrom = new Date(data.effectiveFrom)
    if (isNaN(effectiveFrom.getTime())) return { error: 'Invalid effective date' }

    const clash = await db.statutoryRuleSet.findUnique({
      where: { country_effectiveFrom: { country: data.country, effectiveFrom } },
    })
    if (clash) {
      return {
        error: `A ${data.country} rule set already starts on that date. Pick a different effective date.`,
      }
    }

    const created = await db.statutoryRuleSet.create({
      data: {
        country: data.country,
        effectiveFrom,
        rules: data.rules as never,
        note: data.note ?? null,
        createdBy: session.userId,
      },
    })

    await createAuditLog({
      userId: session.userId,
      action: 'STATUTORY_RULES_CREATED',
      entityType: 'STATUTORY_RULES',
      entityId: created.id,
      details: {
        country: data.country,
        effectiveFrom: effectiveFrom.toISOString(),
        note: data.note ?? null,
        rules: data.rules,
      },
    })

    revalidatePath('/admin/statutory')
    revalidatePath('/payroll')
    return { success: true }
  } catch (err) {
    console.error('createStatutoryRuleSet error:', err)
    return { error: 'Failed to save the rule set' }
  }
}

/**
 * Record that a qualified adviser has signed these values off.
 *
 * This is a record of an external professional judgement, not a substitute for
 * one — the note should say who advised and when. ADMIN-only, deliberately: it
 * is the statement the rest of the app's "unverified" warnings key off.
 */
export async function verifyStatutoryRuleSet(
  id: string,
  verifiedNote: string,
): Promise<StatutoryActionState> {
  try {
    const session = await requireCapability('statutory.verify')

    if (verifiedNote.trim().length < 10) {
      return {
        error:
          'Record who confirmed these values (firm or adviser name, and date or reference) — at least 10 characters.',
      }
    }

    const set = await db.statutoryRuleSet.findUnique({ where: { id } })
    if (!set) return { error: 'Rule set not found' }
    if (set.verifiedBy) return { error: 'This rule set is already marked as verified' }

    await db.statutoryRuleSet.update({
      where: { id },
      data: {
        verifiedBy: session.userId,
        verifiedAt: new Date(),
        verifiedNote: verifiedNote.trim(),
      },
    })

    await createAuditLog({
      userId: session.userId,
      action: 'STATUTORY_RULES_VERIFIED',
      entityType: 'STATUTORY_RULES',
      entityId: id,
      details: { country: set.country, verifiedNote: verifiedNote.trim() },
    })

    revalidatePath('/admin/statutory')
    revalidatePath('/payroll')
    return { success: true }
  } catch (err) {
    console.error('verifyStatutoryRuleSet error:', err)
    return { error: 'Failed to record verification' }
  }
}

/**
 * Write the code baseline into the database for a country that has no rule set
 * yet, so it becomes visible and editable instead of being an invisible
 * fallback. Marked unverified, because that is what it is.
 */
export async function seedBaselineRuleSet(country: 'SG' | 'MY'): Promise<StatutoryActionState> {
  const existing = await db.statutoryRuleSet.findFirst({ where: { country } })
  if (existing) return { error: `${country} already has a rule set` }

  return createStatutoryRuleSet({
    country,
    effectiveFrom: '2000-01-01',
    note:
      country === 'SG'
        ? 'Baseline imported from code. These are the Malaysian figures the app was already applying to Singapore employees — they must be replaced with confirmed Singapore Employment Act values.'
        : 'Baseline imported from code (Employment Act 1955 as amended 2022, as previously implemented). Unverified.',
    rules: BASELINE_RULES[country],
  })
}
