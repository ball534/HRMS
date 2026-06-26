import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { verifySession, requireRole } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'

const UpdateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  position: z.string().optional(),
  department: z.string().optional(),
  employmentType: z.enum(['EMPLOYEE', 'CONTRACTOR', 'PART_TIME']).optional(),
  country: z.enum(['SG', 'MY']).optional(),
  startDate: z.string().optional(),
  reportingManagerId: z.string().nullable().optional(),
  role: z.enum(['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE', 'CONTRACTOR']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']).optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await verifySession()

  const { id } = await params

  const user = await db.user.findUnique({
    where: { id },
    include: {
      reportingManager: {
        select: { id: true, firstName: true, lastName: true },
      },
      directReports: {
        select: { id: true, firstName: true, lastName: true, position: true },
      },
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Exclude passwordHash from response
  const { passwordHash: _, ...userWithoutPassword } = user

  return NextResponse.json({ user: userWithoutPassword })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(['ADMIN'])

  const { id } = await params

  const existing = await db.user.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpdateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const data = parsed.data

  const updated = await db.user.update({
    where: { id },
    data: {
      ...data,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      reportingManagerId:
        data.reportingManagerId === null ? null : data.reportingManagerId,
    },
  })

  await createAuditLog({
    userId: session.userId,
    action: 'USER_UPDATED',
    entityType: 'USER',
    entityId: id,
    details: {
      before: {
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        role: existing.role,
        status: existing.status,
      },
      after: {
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        role: updated.role,
        status: updated.status,
      },
    },
  })

  const { passwordHash: _, ...userWithoutPassword } = updated

  return NextResponse.json({ user: userWithoutPassword })
}
