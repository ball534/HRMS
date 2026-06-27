'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'

export type WorkPassActionState = {
  success?: boolean
  error?: string
  errors?: Record<string, string[]>
}

const PASS_TYPES = [
  'NONE',
  'SG_WORK_PERMIT',
  'SG_S_PASS',
  'SG_EMPLOYMENT_PASS',
  'SG_DEPENDANT_PASS',
  'SG_LTVP_PLUS',
  'MY_WORK_PERMIT',
  'MY_EMPLOYMENT_PASS',
  'MY_DEPENDANT_PASS',
  'OTHER',
] as const

const upsertSchema = z.object({
  passId: z.string().uuid().optional(),
  userId: z.string().uuid(),
  passType: z.enum(PASS_TYPES),
  passNumber: z.string().optional(),
  workPermitNumber: z.string().optional(),
  finNumber: z.string().optional(),
  applicationDate: z.string().optional(),
  approvalDate: z.string().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  levy: z.coerce.number().optional(),
  notes: z.string().optional(),
})

/**
 * Reminder lead time (days before expiry) per pass type:
 *   - Employment Pass + S Pass: 4 months
 *   - Work Permit: 2 months
 *   - other passes: 3 months (sensible default)
 */
function reminderLeadDays(passType: string): number {
  switch (passType) {
    case 'SG_EMPLOYMENT_PASS':
    case 'SG_S_PASS':
    case 'MY_EMPLOYMENT_PASS':
      return 120
    case 'SG_WORK_PERMIT':
    case 'MY_WORK_PERMIT':
      return 60
    default:
      return 90
  }
}

export async function upsertWorkPass(
  _state: WorkPassActionState,
  formData: FormData,
): Promise<WorkPassActionState> {
  try {
    const session = await requireRole(['ADMIN'])

    const raw = Object.fromEntries(formData.entries())
    for (const k of ['passId', 'issueDate', 'expiryDate', 'levy', 'applicationDate', 'approvalDate']) {
      if (raw[k] === '') delete (raw as Record<string, unknown>)[k]
    }

    const parsed = upsertSchema.safeParse(raw)
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }
    const data = parsed.data

    if (data.passId) {
      await db.workPass.update({
        where: { id: data.passId },
        data: {
          passType: data.passType,
          passNumber: data.passNumber ?? null,
          workPermitNumber: data.workPermitNumber ?? null,
          finNumber: data.finNumber ?? null,
          applicationDate: data.applicationDate ? new Date(data.applicationDate) : null,
          approvalDate: data.approvalDate ? new Date(data.approvalDate) : null,
          issueDate: data.issueDate ? new Date(data.issueDate) : null,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
          levy: data.levy ?? null,
          notes: data.notes ?? null,
        },
      })
      await createAuditLog({
        userId: session.userId,
        action: 'WORK_PASS_UPDATED',
        entityType: 'WORK_PASS',
        entityId: data.passId,
      })
    } else {
      const created = await db.workPass.create({
        data: {
          userId: data.userId,
          passType: data.passType,
          passNumber: data.passNumber ?? null,
          workPermitNumber: data.workPermitNumber ?? null,
          finNumber: data.finNumber ?? null,
          applicationDate: data.applicationDate ? new Date(data.applicationDate) : null,
          approvalDate: data.approvalDate ? new Date(data.approvalDate) : null,
          issueDate: data.issueDate ? new Date(data.issueDate) : null,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
          levy: data.levy ?? null,
          notes: data.notes ?? null,
        },
      })
      await createAuditLog({
        userId: session.userId,
        action: 'WORK_PASS_CREATED',
        entityType: 'WORK_PASS',
        entityId: created.id,
        details: { userId: data.userId, passType: data.passType },
      })
    }

    revalidatePath(`/people/${data.userId}`)
    revalidatePath('/admin/work-passes')
    return { success: true }
  } catch (err) {
    console.error('upsertWorkPass error:', err)
    return { error: 'Failed to save work pass.' }
  }
}

export async function deleteWorkPass(passId: string): Promise<WorkPassActionState> {
  try {
    const session = await requireRole(['ADMIN'])
    const pass = await db.workPass.findUniqueOrThrow({ where: { id: passId } })
    await db.workPass.delete({ where: { id: passId } })
    await createAuditLog({
      userId: session.userId,
      action: 'WORK_PASS_DELETED',
      entityType: 'WORK_PASS',
      entityId: passId,
      details: { userId: pass.userId },
    })
    revalidatePath(`/people/${pass.userId}`)
    revalidatePath('/admin/work-passes')
    return { success: true }
  } catch (err) {
    console.error('deleteWorkPass error:', err)
    return { error: 'Failed to delete work pass.' }
  }
}

const PASS_USER_SELECT = {
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

function daysUntil(expiry: Date | null): number | null {
  if (!expiry) return null
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Active users + their work passes, grouped using the *type-specific* reminder
 * lead time (EP/S Pass = 4 months, Work Permit = 2 months):
 *   - expired: past expiry
 *   - due:     inside its reminder window (needs review before renewal)
 *   - ok:      outside the window
 */
export async function getWorkPassDashboard() {
  await requireRole(['ADMIN'])

  const passes = await db.workPass.findMany({
    where: { passType: { not: 'NONE' } },
    include: { user: { select: PASS_USER_SELECT } },
    orderBy: { expiryDate: 'asc' },
  })

  const active = passes.filter(p => p.user.status === 'ACTIVE')
  const bucket = (p: (typeof passes)[number]): 'expired' | 'due' | 'ok' => {
    const d = daysUntil(p.expiryDate)
    if (d === null) return 'ok'
    if (d < 0) return 'expired'
    if (d <= reminderLeadDays(p.passType)) return 'due'
    return 'ok'
  }

  return {
    expired: active.filter(p => bucket(p) === 'expired'),
    due: active.filter(p => bucket(p) === 'due'),
    ok: active.filter(p => bucket(p) === 'ok'),
  }
}

/**
 * Passes whose expiry is exactly `leadDays` away today (one-shot reminder),
 * plus any already expired. Used by the daily cron to email HR.
 */
export async function getWorkPassesForReminder() {
  const passes = await db.workPass.findMany({
    where: { passType: { not: 'NONE' }, expiryDate: { not: null }, user: { status: 'ACTIVE' } },
    include: { user: { select: PASS_USER_SELECT } },
  })

  return passes.filter(p => {
    const d = daysUntil(p.expiryDate)
    if (d === null) return false
    // Fire on the exact lead-day threshold (single reminder, no repeat spam).
    return d === reminderLeadDays(p.passType)
  })
}

export async function getUserWorkPasses(userId: string) {
  await requireRole(['ADMIN'])
  return db.workPass.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}
