'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'

const HolidaySchema = z.object({
  country: z.enum(['SG', 'MY'], {
    message: 'Country is required',
  }),
  date: z.string().min(1, 'Date is required'),
  name: z.string().min(1, 'Name is required'),
  year: z.coerce.number().int().min(2020).max(2099),
  isObserved: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === 'on'),
  type: z.enum(['PUBLIC_HOLIDAY', 'COLLECTIVE_LEAVE']).default('PUBLIC_HOLIDAY'),
})

const UpdateHolidaySchema = HolidaySchema.partial().extend({
  id: z.string().min(1, 'Holiday ID is required'),
})

export type HolidayState = {
  errors?: Record<string, string[]>
  error?: string
  success?: boolean
}

export async function createHoliday(
  _state: HolidayState,
  formData: FormData
): Promise<HolidayState> {
  const session = await requireRole(['ADMIN'])

  const raw = {
    country: formData.get('country'),
    date: formData.get('date'),
    name: formData.get('name'),
    year: formData.get('year'),
    isObserved: formData.get('isObserved') ?? 'true',
    type: formData.get('type') ?? 'PUBLIC_HOLIDAY',
  }

  const parsed = HolidaySchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const data = parsed.data
  const date = new Date(data.date)

  // Check for duplicate
  const existing = await db.publicHoliday.findUnique({
    where: { country_date: { country: data.country, date } },
  })
  if (existing) {
    return { errors: { date: ['A holiday already exists for this country on that date'] } }
  }

  const holiday = await db.publicHoliday.create({
    data: {
      country: data.country,
      date,
      name: data.name,
      year: data.year,
      isObserved: data.isObserved,
      type: data.type,
    },
  })

  await createAuditLog({
    userId: session.userId,
    action: 'USER_CREATED',
    entityType: 'HOLIDAY',
    entityId: holiday.id,
    details: {
      after: {
        country: holiday.country,
        date: holiday.date.toISOString(),
        name: holiday.name,
        type: holiday.type,
      },
    },
  })

  return { success: true }
}

export async function updateHoliday(
  _state: HolidayState,
  formData: FormData
): Promise<HolidayState> {
  const session = await requireRole(['ADMIN'])

  const raw = {
    id: formData.get('id'),
    country: formData.get('country') || undefined,
    date: formData.get('date') || undefined,
    name: formData.get('name') || undefined,
    year: formData.get('year') || undefined,
    isObserved: formData.get('isObserved') ?? undefined,
    type: formData.get('type') || undefined,
  }

  const parsed = UpdateHolidaySchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { id, ...data } = parsed.data

  const existing = await db.publicHoliday.findUnique({ where: { id } })
  if (!existing) {
    return { error: 'Holiday not found' }
  }

  const updated = await db.publicHoliday.update({
    where: { id },
    data: {
      ...data,
      date: data.date ? new Date(data.date) : undefined,
    },
  })

  await createAuditLog({
    userId: session.userId,
    action: 'USER_UPDATED',
    entityType: 'HOLIDAY',
    entityId: id,
    details: {
      before: {
        name: existing.name,
        date: existing.date.toISOString(),
        type: existing.type,
        isObserved: existing.isObserved,
      },
      after: {
        name: updated.name,
        date: updated.date.toISOString(),
        type: updated.type,
        isObserved: updated.isObserved,
      },
    },
  })

  return { success: true }
}
