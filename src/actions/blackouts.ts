'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireCapability } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'

export type BlackoutActionState = {
  success?: boolean
  error?: string
  errors?: Record<string, string[]>
}

const schema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required'),
  reason: z.string().optional(),
  country: z.enum(['SG', 'MY', 'ALL']).default('ALL'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  hardBlock: z.string().optional(),
})

function toDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`)
}

export async function upsertBlackout(
  _state: BlackoutActionState,
  formData: FormData,
): Promise<BlackoutActionState> {
  try {
    const session = await requireCapability('blackouts.write')
    const raw = Object.fromEntries(formData.entries())
    if (raw.id === '') delete (raw as Record<string, unknown>).id

    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }
    const data = parsed.data
    const start = toDateOnly(data.startDate)
    const end = toDateOnly(data.endDate)
    if (start > end) return { error: 'Start date must be before end date.' }

    const hardBlock = data.hardBlock === 'true' || data.hardBlock === 'on'
    const country = data.country === 'ALL' ? null : data.country

    if (data.id) {
      await db.blackoutWindow.update({
        where: { id: data.id },
        data: {
          name: data.name,
          reason: data.reason ?? null,
          country,
          startDate: start,
          endDate: end,
          hardBlock,
        },
      })
      await createAuditLog({
        userId: session.userId,
        action: 'BLACKOUT_UPDATED',
        entityType: 'BLACKOUT',
        entityId: data.id,
      })
    } else {
      const created = await db.blackoutWindow.create({
        data: {
          name: data.name,
          reason: data.reason ?? null,
          country,
          startDate: start,
          endDate: end,
          hardBlock,
        },
      })
      await createAuditLog({
        userId: session.userId,
        action: 'BLACKOUT_CREATED',
        entityType: 'BLACKOUT',
        entityId: created.id,
        details: { name: data.name, country, hardBlock },
      })
    }

    revalidatePath('/admin/blackouts')
    return { success: true }
  } catch (err) {
    console.error('upsertBlackout error:', err)
    return { error: 'Failed to save blackout window.' }
  }
}

export async function deleteBlackout(id: string): Promise<BlackoutActionState> {
  try {
    const session = await requireCapability('blackouts.write')
    await db.blackoutWindow.delete({ where: { id } })
    await createAuditLog({
      userId: session.userId,
      action: 'BLACKOUT_DELETED',
      entityType: 'BLACKOUT',
      entityId: id,
    })
    revalidatePath('/admin/blackouts')
    return { success: true }
  } catch (err) {
    console.error('deleteBlackout error:', err)
    return { error: 'Failed to delete blackout window.' }
  }
}

export async function listBlackouts() {
  await requireCapability('blackouts.write')
  return db.blackoutWindow.findMany({ orderBy: { startDate: 'asc' } })
}

/**
 * Returns blackouts that overlap the given leave window for the given country.
 * Used by leave submission to warn or block.
 */
export async function findOverlappingBlackouts(
  country: 'SG' | 'MY',
  startDate: Date,
  endDate: Date,
) {
  return db.blackoutWindow.findMany({
    where: {
      OR: [{ country }, { country: null }],
      AND: [
        { startDate: { lte: endDate } },
        { endDate: { gte: startDate } },
      ],
    },
  })
}
