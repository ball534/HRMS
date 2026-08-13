import 'server-only'

import { cache } from 'react'
import { z } from 'zod'
import { db } from '@/lib/db'

/**
 * Org settings — the operational knobs.
 *
 * These used to be hardcoded constants sprinkled through the code, which had
 * two consequences: nobody outside engineering could change them, and in at
 * least one case the UI and the code disagreed about what the value was (the
 * carry-forward form promised a 5-day cap that `leaveBalance.ts` never
 * applied). Naming them here gives one place to read the real value from and
 * one screen to change it on.
 *
 * This file is "what we decided". Statutory rules — "what the law says" —
 * live in src/lib/statutory.ts, are versioned by effective date, and are
 * reviewed by different people. Don't mix them.
 *
 * Reading:
 *
 *   const cap = await getSetting('leave.carryForwardCap')   // typed as number
 *
 * Every read falls back to the default below, so a missing row is never an
 * error and the app works on a database that has never seen the settings
 * table.
 */

// ============================================================
// The registry
// ============================================================

/**
 * One entry per setting: how to validate it, what it means, and what it is
 * when nobody has set it. `group` and `label` drive the admin screen, so a new
 * setting shows up there without any UI work.
 */
export const SETTING_DEFS = {
  'leave.carryForwardCap': {
    schema: z.number().int().min(0).max(365),
    default: 5,
    group: 'Leave',
    label: 'Carry-forward cap (days)',
    description:
      'Maximum unused annual leave that carries into the next year. The carry-forward screen has always shown a 5-day cap; before this setting existed the code carried the full unused balance regardless.',
  },
  'leave.carryForwardExpiryMonth': {
    schema: z.number().int().min(1).max(12),
    default: 3,
    group: 'Leave',
    label: 'Carry-forward expires end of month',
    description: 'Month in which carried-over days expire (3 = 31 March).',
  },
  'leave.fallbackApproverId': {
    schema: z.string().uuid().nullable(),
    default: null as string | null,
    group: 'Approvals',
    label: 'Fallback approver',
    description:
      'Who receives an approval when the employee has no reporting manager, or when the only eligible approver is the requester themselves. Without this, employees with no manager could not submit leave at all.',
  },
  'approvals.blockSelfApproval': {
    schema: z.boolean(),
    default: true,
    group: 'Approvals',
    label: 'Block self-approval',
    description:
      'Prevent anyone actioning their own leave, timesheet, expense claim, bonus or review. Leave this on unless you have a specific reason not to.',
  },
  'lms.maxTestAttempts': {
    schema: z.number().int().min(1).max(20),
    default: 3,
    group: 'Learning',
    label: 'Test attempts before lockout',
    description: 'Failed attempts a learner may make on a test before it locks and needs an HR reset.',
  },
  'files.maxUploadMb': {
    schema: z.number().int().min(1).max(50),
    default: 10,
    group: 'Files',
    label: 'Maximum upload size (MB)',
    description:
      'Applies to documents, expense receipts and leave attachments. Files are stored in the database, so raising this also grows your backups. Must stay at or below the server body limit in next.config.ts (currently 10 MB).',
  },

  // Work-pass renewal lead times.
  //
  // Kept per pass type rather than as one number, because the renewal windows
  // genuinely differ — an Employment Pass needs starting on months before a
  // Work Permit does. Set all three to the same value if you'd rather run one
  // lead time for everything.
  'workpass.leadDays.employmentPass': {
    schema: z.number().int().min(1).max(730),
    default: 120,
    group: 'Work passes',
    label: 'Employment Pass / S Pass — remind this many days before expiry',
    description:
      'Applies to SG Employment Pass, SG S Pass and MY Employment Pass. Reminders repeat daily from this point until the pass record is updated.',
  },
  'workpass.leadDays.workPermit': {
    schema: z.number().int().min(1).max(730),
    default: 60,
    group: 'Work passes',
    label: 'Work Permit — remind this many days before expiry',
    description: 'Applies to SG Work Permit and MY Work Permit.',
  },
  'workpass.leadDays.other': {
    schema: z.number().int().min(1).max(730),
    default: 90,
    group: 'Work passes',
    label: 'All other pass types — remind this many days before expiry',
    description:
      'Dependant passes, LTVP+, and anything recorded as Other.',
  },
  'notify.emailEnabled': {
    schema: z.boolean(),
    default: true,
    group: 'Notifications',
    label: 'Send notification emails',
    description:
      'In-app notifications are always written. Turn this off to stop the app emailing anyone — useful when running against a copy of production data.',
  },
  'session.durationHours': {
    schema: z.number().int().min(1).max(720),
    default: 168,
    group: 'Security',
    label: 'Session length (hours)',
    description:
      'How long a login lasts. Termination and deactivation take effect immediately regardless of this value, because the session is checked against the database on every request.',
  },
} as const

export type SettingKey = keyof typeof SETTING_DEFS
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_DEFS)[K]['schema']>

export const SETTING_KEYS = Object.keys(SETTING_DEFS) as SettingKey[]

// ============================================================
// Reads
// ============================================================

/**
 * All stored rows, once per request. Individual `getSetting` calls read from
 * this so a page touching six settings still makes one query.
 */
const loadAll = cache(async (): Promise<Map<string, unknown>> => {
  try {
    const rows = await db.orgSetting.findMany()
    return new Map(rows.map(r => [r.key, r.value]))
  } catch (err) {
    // A missing table (fresh clone, migration not yet run) must not take the
    // whole app down — every caller has a usable default.
    console.error('[settings] could not load org settings, using defaults:', err)
    return new Map()
  }
})

/** The effective value of a setting: stored value if valid, otherwise the default. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const def = SETTING_DEFS[key]
  const stored = (await loadAll()).get(key)

  if (stored === undefined) return def.default as SettingValue<K>

  const parsed = def.schema.safeParse(stored)
  if (!parsed.success) {
    // Someone wrote a bad value straight to the database. Prefer the default
    // over propagating something the rest of the code can't handle.
    console.error(`[settings] invalid stored value for ${key}, using default`, parsed.error.issues)
    return def.default as SettingValue<K>
  }

  return parsed.data as SettingValue<K>
}

/** Every setting with its effective value — for the admin screen. */
export async function getAllSettings(): Promise<
  { key: SettingKey; value: unknown; isDefault: boolean; updatedBy: string | null; updatedAt: Date | null }[]
> {
  const rows = await db.orgSetting.findMany()
  const byKey = new Map(rows.map(r => [r.key, r]))

  return SETTING_KEYS.map(key => {
    const row = byKey.get(key)
    const def = SETTING_DEFS[key]
    const parsed = row ? def.schema.safeParse(row.value) : null

    return {
      key,
      value: parsed?.success ? parsed.data : def.default,
      isDefault: !row || !parsed?.success,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt ?? null,
    }
  })
}

// ============================================================
// Writes
// ============================================================

/**
 * Validate and persist a setting. Returns the parsed value so the caller can
 * put the old and new values in an audit log entry.
 *
 * Authorization is the caller's job — see `setOrgSetting` in
 * src/actions/settings.ts, which gates on `settings.write` and audits.
 */
export async function writeSetting<K extends SettingKey>(
  key: K,
  rawValue: unknown,
  updatedBy: string,
): Promise<{ value: SettingValue<K> }> {
  const def = SETTING_DEFS[key]
  const parsed = def.schema.safeParse(rawValue)

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? `Invalid value for ${key}`)
  }

  await db.orgSetting.upsert({
    where: { key },
    create: { key, value: parsed.data as never, updatedBy },
    update: { value: parsed.data as never, updatedBy },
  })

  return { value: parsed.data as SettingValue<K> }
}
