import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { verifySession, requireRole } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'

const HolidaySchema = z.object({
  country: z.enum(['SG', 'MY']),
  date: z.string().min(1, 'Date is required'),
  name: z.string().min(1, 'Name is required'),
  year: z.number().int().min(2020).max(2099),
  isObserved: z.boolean().default(true),
  type: z.enum(['PUBLIC_HOLIDAY', 'COLLECTIVE_LEAVE']).default('PUBLIC_HOLIDAY'),
})

const UpdateHolidaySchema = HolidaySchema.partial().extend({
  id: z.string().min(1, 'ID is required'),
})

export async function GET(request: NextRequest) {
  await verifySession()

  const { searchParams } = new URL(request.url)
  const country = searchParams.get('country') ?? ''
  const year = parseInt(searchParams.get('year') ?? '2026', 10)

  const where: Record<string, unknown> = { year }

  if (country) {
    where.country = country
  }

  const holidays = await db.publicHoliday.findMany({
    where,
    orderBy: { date: 'asc' },
  })

  return NextResponse.json({ holidays })
}

export async function POST(request: NextRequest) {
  const session = await requireRole(['ADMIN'])

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = HolidaySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const data = parsed.data
  const date = new Date(data.date)

  // Check for duplicate
  const existing = await db.publicHoliday.findUnique({
    where: { country_date: { country: data.country, date } },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'A holiday already exists for this country on that date' },
      { status: 409 }
    )
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
    action: 'USER_CREATED', // closest available — holiday creation
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

  return NextResponse.json({ holiday }, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireRole(['ADMIN'])

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
  }

  const existing = await db.publicHoliday.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Holiday not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpdateHolidaySchema.safeParse({ ...(body as Record<string, unknown>), id })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const { id: _id, ...data } = parsed.data

  const updated = await db.publicHoliday.update({
    where: { id },
    data: {
      ...data,
      date: data.date ? new Date(data.date) : undefined,
    },
  })

  await createAuditLog({
    userId: session.userId,
    action: 'USER_UPDATED', // closest available — holiday update
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

  return NextResponse.json({ holiday: updated })
}
