import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { verifySession, requireCapability } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'

const CreateUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  position: z.string().min(1, 'Position is required'),
  department: z.string().min(1, 'Department is required'),
  employmentType: z.enum(['EMPLOYEE', 'CONTRACTOR', 'PART_TIME']),
  country: z.enum(['SG', 'MY']),
  startDate: z.string().optional(),
  reportingManagerId: z.string().optional(),
  role: z.enum(['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE', 'CONTRACTOR']),
})

export async function GET(request: NextRequest) {
  await verifySession()

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') ?? ''
  const department = searchParams.get('department') ?? ''
  const country = searchParams.get('country') ?? ''
  const status = searchParams.get('status') ?? ''
  const includeTerminated = searchParams.get('includeTerminated') === 'true'

  const where: Record<string, unknown> = {}

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (department) {
    where.department = { equals: department, mode: 'insensitive' }
  }

  if (country) {
    where.country = country
  }

  if (status) {
    where.status = status
  } else if (!includeTerminated) {
    where.status = { not: 'TERMINATED' }
  }

  const users = await db.user.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      department: true,
      position: true,
      country: true,
      status: true,
      employmentType: true,
      profilePhotoUrl: true,
      reportingManagerId: true,
      role: true,
      _count: {
        select: { directReports: true },
      },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })

  return NextResponse.json({ users })
}

export async function POST(request: NextRequest) {
  const session = await requireCapability('people.write')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const data = parsed.data

  // Check email uniqueness
  const existing = await db.user.findUnique({ where: { email: data.email } })
  if (existing) {
    return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash('changeme123', 12)

  const user = await db.user.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      nationality: data.nationality,
      position: data.position,
      department: data.department,
      employmentType: data.employmentType,
      country: data.country,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      reportingManagerId: data.reportingManagerId || undefined,
      role: data.role,
      passwordHash,
      mustChangePassword: true,
      status: 'ACTIVE',
    },
  })

  await createAuditLog({
    userId: session.userId,
    action: 'USER_CREATED',
    entityType: 'USER',
    entityId: user.id,
    details: {
      after: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        country: user.country,
      },
    },
  })

  return NextResponse.json({ user }, { status: 201 })
}
