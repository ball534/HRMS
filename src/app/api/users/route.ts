import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { verifySession, requireCapability } from '@/lib/dal'
import { can, ROLES } from '@/lib/permissions'
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
  employmentType: z.enum(['EMPLOYEE', 'CONTRACTOR']),
  country: z.enum(['SG', 'MY']),
  startDate: z.string().optional(),
  reportingManagerId: z.string().optional(),
  role: z.enum(ROLES),
})

/**
 * The people directory.
 *
 * This used to require nothing but a session, which made the whole staff list —
 * names, emails, phone numbers, reporting lines — readable by anyone logged in,
 * including through a hand-made request that ignored whatever the UI showed.
 * Now HR reads everyone, a manager reads their own department and nobody else
 * reads anything.
 */
export async function GET(request: NextRequest) {
  const session = await verifySession()

  const seesEveryone = can(session.role, 'people.read.directory')
  const seesOwnDepartment = can(session.role, 'people.read.department')

  if (!seesEveryone && !seesOwnDepartment) {
    return NextResponse.json(
      { error: 'You do not have permission to browse the employee directory' },
      { status: 403 },
    )
  }

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

  // A manager's scope is their own department, whatever the query string asks
  // for. Applied last so it overrides the filter above rather than sitting
  // alongside it.
  if (!seesEveryone) {
    const me = await db.user.findUnique({
      where: { id: session.userId },
      select: { department: true },
    })
    if (!me?.department) {
      return NextResponse.json({ users: [] })
    }
    where.department = { equals: me.department, mode: 'insensitive' }
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
      employmentType: data.role === 'PARTTIME' ? 'PART_TIME' : data.employmentType,
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
