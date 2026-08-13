import 'server-only'

import { db } from '@/lib/db'
import { getSetting } from '@/lib/settings'

/**
 * Work-pass helpers shared by the server actions (src/actions/workPass.ts)
 * and the daily cron (src/lib/reminders.ts).
 *
 * Why this module exists: the reminder query used to be an exported function
 * in a `'use server'` file, which makes it a callable endpoint. It had no auth
 * check at all, so anyone with a session — or anyone who could POST to the
 * action id — could pull back every foreign worker's FIN, passport number and
 * pass expiry. Moving the query into a plain server-only module means the cron
 * can use it while the only *action* exposed to the network keeps its
 * capability check.
 */

export const PASS_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  country: true,
  status: true,
  position: true,
  department: true,
  company: true,
  passportNumber: true,
  passportExpiry: true,
} as const

/**
 * Reminder lead times, in days before expiry, per pass-type family.
 *
 * These used to be hardcoded (120 / 60 / 90). They are now maintained by
 * ADMIN in Settings → Work passes, because how far ahead a renewal needs
 * starting is an operational judgement that changes with processing times —
 * not something that should need a deploy.
 */
export type LeadDaysConfig = {
  employmentPass: number
  workPermit: number
  other: number
}

/**
 * Read the configured lead times once. Call this before iterating passes and
 * pass the result to `reminderLeadDays`, rather than reading settings inside
 * the loop.
 */
export async function getLeadDaysConfig(): Promise<LeadDaysConfig> {
  const [employmentPass, workPermit, other] = await Promise.all([
    getSetting('workpass.leadDays.employmentPass'),
    getSetting('workpass.leadDays.workPermit'),
    getSetting('workpass.leadDays.other'),
  ])
  return { employmentPass, workPermit, other }
}

/** Which configured lead time applies to a given pass type. */
export function reminderLeadDays(passType: string, config: LeadDaysConfig): number {
  switch (passType) {
    case 'SG_EMPLOYMENT_PASS':
    case 'SG_S_PASS':
    case 'MY_EMPLOYMENT_PASS':
      return config.employmentPass
    case 'SG_WORK_PERMIT':
    case 'MY_WORK_PERMIT':
      return config.workPermit
    default:
      return config.other
  }
}

export function daysUntil(expiry: Date | null): number | null {
  if (!expiry) return null
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Passes the cron should chase today.
 *
 * `due` fires from the type-specific lead day onwards rather than on the exact
 * lead day only — a single missed cron run used to mean the reminder never
 * fired for that pass at all. `expired` is returned separately because a
 * lapsed pass is an immigration exposure, not a reminder: someone may be
 * working without valid authorisation.
 */
export async function findWorkPassesDueForReminder() {
  const passes = await db.workPass.findMany({
    where: {
      passType: { not: 'NONE' },
      expiryDate: { not: null },
      user: { status: 'ACTIVE' },
    },
    include: { user: { select: PASS_USER_SELECT } },
    orderBy: { expiryDate: 'asc' },
  })

  const config = await getLeadDaysConfig()
  const due: typeof passes = []
  const expired: typeof passes = []

  for (const p of passes) {
    const d = daysUntil(p.expiryDate)
    if (d === null) continue
    if (d < 0) expired.push(p)
    else if (d <= reminderLeadDays(p.passType, config)) due.push(p)
  }

  return { due, expired }
}
