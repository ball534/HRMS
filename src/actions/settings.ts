'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireCapability } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import {
  SETTING_DEFS,
  SETTING_KEYS,
  getAllSettings,
  getSetting,
  writeSetting,
  type SettingKey,
} from '@/lib/settings'

export type SettingsActionState = { success?: boolean; error?: string }

export type SettingRow = {
  key: SettingKey
  label: string
  description: string
  group: string
  kind: 'number' | 'boolean' | 'user' | 'user-per-department'
  value: unknown
  isDefault: boolean
  updatedByName: string | null
  updatedAt: string | null
}

/**
 * Which control the admin screen renders for a setting. Derived from the
 * default's type, with the one user-reference setting special-cased so it gets
 * a person picker rather than a free-text uuid box.
 */
function kindFor(key: SettingKey): SettingRow['kind'] {
  if (key === 'leave.fallbackApproverId') return 'user'
  if (key === 'letters.departmentSignatories') return 'user-per-department'
  const d = SETTING_DEFS[key].default
  if (typeof d === 'boolean') return 'boolean'
  return 'number'
}

export async function getSettingsForAdmin(): Promise<{
  rows: SettingRow[]
  approverOptions: { id: string; name: string; role: string }[]
}> {
  await requireCapability('settings.write')

  const stored = await getAllSettings()

  // Resolve editor ids to names, and offer the people who could act as a
  // fallback approver: anyone who can approve leave for someone else.
  const editorIds = stored.map(s => s.updatedBy).filter((v): v is string => !!v)
  const [editors, approvers] = await Promise.all([
    editorIds.length
      ? db.user.findMany({
          where: { id: { in: editorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve([]),
    db.user.findMany({
      where: { status: 'ACTIVE', role: { in: ['HR', 'MANAGER'] } },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
  ])
  const editorName = new Map(editors.map(e => [e.id, `${e.firstName} ${e.lastName}`]))

  const rows: SettingRow[] = SETTING_KEYS.map(key => {
    const s = stored.find(x => x.key === key)!
    const def = SETTING_DEFS[key]
    return {
      key,
      label: def.label,
      description: def.description,
      group: def.group,
      kind: kindFor(key),
      value: s.value,
      isDefault: s.isDefault,
      updatedByName: s.updatedBy ? (editorName.get(s.updatedBy) ?? 'Unknown user') : null,
      updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
    }
  })

  return {
    rows,
    approverOptions: approvers.map(a => ({
      id: a.id,
      name: `${a.firstName} ${a.lastName}`,
      role: a.role,
    })),
  }
}

/**
 * Change one setting. Records the previous and new value in the audit log so
 * "who raised the carry-forward cap, and when" is answerable.
 */
export async function setOrgSetting(
  key: SettingKey,
  rawValue: unknown,
): Promise<SettingsActionState> {
  try {
    const session = await requireCapability('settings.write')

    if (!SETTING_KEYS.includes(key)) {
      return { error: 'Unknown setting' }
    }

    const previous = await getSetting(key)
    const { value } = await writeSetting(key, rawValue, session.userId)

    await createAuditLog({
      userId: session.userId,
      action: 'SETTING_UPDATED',
      entityType: 'SETTING',
      entityId: key,
      details: { key, from: previous ?? null, to: value ?? null },
    })

    revalidatePath('/admin/settings')
    return { success: true }
  } catch (err) {
    console.error('setOrgSetting error:', err)
    return { error: err instanceof Error ? err.message : 'Failed to save setting' }
  }
}
