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
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  levy: z.coerce.number().optional(),
  notes: z.string().optional(),
})

export async function upsertWorkPass(
  _state: WorkPassActionState,
  formData: FormData,
): Promise<WorkPassActionState> {
  try {
    const session = await requireRole(['ADMIN'])

    const raw = Object.fromEntries(formData.entries())
    if (raw.passId === '') delete (raw as Record<string, unknown>).passId
    if (raw.issueDate === '') delete (raw as Record<string, unknown>).issueDate
    if (raw.expiryDate === '') delete (raw as Record<string, unknown>).expiryDate
    if (raw.levy === '') delete (raw as Record<string, unknown>).levy

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

/**
 * Active users + their currently-active work pass (latest expiry > today),
 * grouped by urgency (expired / 30d / 60d / 90d / fine).
 */
export async function getWorkPassDashboard() {
  await requireRole(['ADMIN'])

  const passes = await db.workPass.findMany({
    where: { passType: { not: 'NONE' } },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          country: true,
          status: true,
          position: true,
          department: true,
        },
      },
    },
    orderBy: { expiryDate: 'asc' },
  })

  // Group active users only
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const bucket = (p: (typeof passes)[number]): 'expired' | 'thirty' | 'sixty' | 'ninety' | 'fine' => {
    if (!p.expiryDate) return 'fine'
    const diffDays = Math.floor((p.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return 'expired'
    if (diffDays <= 30) return 'thirty'
    if (diffDays <= 60) return 'sixty'
    if (diffDays <= 90) return 'ninety'
    return 'fine'
  }
  const filtered = passes.filter(p => p.user.status === 'ACTIVE')

  return {
    expired: filtered.filter(p => bucket(p) === 'expired'),
    thirty: filtered.filter(p => bucket(p) === 'thirty'),
    sixty: filtered.filter(p => bucket(p) === 'sixty'),
    ninety: filtered.filter(p => bucket(p) === 'ninety'),
    fine: filtered.filter(p => bucket(p) === 'fine'),
  }
}

export async function getUserWorkPasses(userId: string) {
  await requireRole(['ADMIN'])
  return db.workPass.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}
