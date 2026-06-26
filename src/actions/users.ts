'use server'

import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { verifySession } from '@/lib/dal'
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
  employmentType: z.enum(['EMPLOYEE', 'CONTRACTOR', 'PART_TIME'], {
    message: 'Employment type is required',
  }),
  country: z.enum(['SG', 'MY'], {
    message: 'Country is required',
  }),
  startDate: z.string().optional(),
  reportingManagerId: z.string().optional(),
  role: z.enum(['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE', 'CONTRACTOR'], {
    message: 'Role is required',
  }),
})

export type CreateUserState = {
  errors?: Record<string, string[]>
  error?: string
  success?: boolean
}

export async function createUser(
  _state: CreateUserState,
  formData: FormData
): Promise<CreateUserState> {
  const session = await verifySession()

  if (session.role !== 'ADMIN') {
    return { error: 'Permission denied: Admin access required' }
  }

  const raw = {
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    phone: formData.get('phone') || undefined,
    dateOfBirth: formData.get('dateOfBirth') || undefined,
    nationality: formData.get('nationality') || undefined,
    position: formData.get('position'),
    department: formData.get('department'),
    employmentType: formData.get('employmentType'),
    country: formData.get('country'),
    startDate: formData.get('startDate') || undefined,
    reportingManagerId: formData.get('reportingManagerId') || undefined,
    role: formData.get('role'),
  }

  const parsed = CreateUserSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const data = parsed.data

  // Check email uniqueness
  const existing = await db.user.findUnique({ where: { email: data.email } })
  if (existing) {
    return { errors: { email: ['Email address already exists'] } }
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

  redirect('/people')
}

// ============================================================
// Update user
// ============================================================

const UpdateUserSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  position: z.string().optional(),
  department: z.string().optional(),
  employmentType: z.enum(['EMPLOYEE', 'CONTRACTOR', 'PART_TIME']),
  country: z.enum(['SG', 'MY']),
  startDate: z.string().optional(),
  reportingManagerId: z.string().optional(),
  role: z.enum(['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE', 'CONTRACTOR']),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']),
})

export type UpdateUserState = {
  errors?: Record<string, string[]>
  error?: string
  success?: boolean
}

export async function updateUser(
  _state: UpdateUserState,
  formData: FormData
): Promise<UpdateUserState> {
  const session = await verifySession()

  if (session.role !== 'ADMIN') {
    return { error: 'Permission denied: Admin access required' }
  }

  const raw = {
    id: formData.get('id'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    phone: formData.get('phone') || undefined,
    dateOfBirth: formData.get('dateOfBirth') || undefined,
    nationality: formData.get('nationality') || undefined,
    position: formData.get('position') || undefined,
    department: formData.get('department') || undefined,
    employmentType: formData.get('employmentType'),
    country: formData.get('country'),
    startDate: formData.get('startDate') || undefined,
    reportingManagerId: formData.get('reportingManagerId') || undefined,
    role: formData.get('role'),
    status: formData.get('status'),
  }

  const parsed = UpdateUserSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const data = parsed.data

  // Check email uniqueness (excluding current user)
  const existing = await db.user.findUnique({ where: { email: data.email } })
  if (existing && existing.id !== data.id) {
    return { errors: { email: ['Email address already in use by another user'] } }
  }

  const before = await db.user.findUnique({
    where: { id: data.id },
    select: { status: true, role: true, email: true, firstName: true, lastName: true },
  })

  if (!before) {
    return { error: 'User not found' }
  }

  await db.user.update({
    where: { id: data.id },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone || null,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      nationality: data.nationality || null,
      position: data.position || null,
      department: data.department || null,
      employmentType: data.employmentType,
      country: data.country,
      startDate: data.startDate ? new Date(data.startDate) : null,
      reportingManagerId: data.reportingManagerId || null,
      role: data.role,
      status: data.status,
      // Auto-set terminatedAt when status changes to TERMINATED, clear when un-terminating
      terminatedAt:
        data.status === 'TERMINATED' && before.status !== 'TERMINATED'
          ? new Date()
          : data.status !== 'TERMINATED' && before.status === 'TERMINATED'
            ? null
            : undefined,
    },
  })

  await createAuditLog({
    userId: session.userId,
    action: 'USER_UPDATED',
    entityType: 'USER',
    entityId: data.id,
    details: {
      before: { status: before.status, role: before.role },
      after: { status: data.status, role: data.role },
    },
  })

  return { success: true }
}

// ============================================================
// Admin reset password
// ============================================================

export async function adminResetPassword(
  userId: string
): Promise<{ success: boolean; tempPassword?: string; error?: string }> {
  const session = await verifySession()

  if (session.role !== 'ADMIN') {
    return { success: false, error: 'Permission denied' }
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true },
  })

  if (!user) {
    return { success: false, error: 'User not found' }
  }

  const tempPassword = 'changeme123'
  const passwordHash = await bcrypt.hash(tempPassword, 12)

  await db.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: true },
  })

  await createAuditLog({
    userId: session.userId,
    action: 'PASSWORD_CHANGED',
    entityType: 'USER',
    entityId: userId,
    details: { resetBy: session.userId },
  })

  return { success: true, tempPassword }
}
