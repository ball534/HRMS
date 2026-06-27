'use server'

import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { addMonths } from 'date-fns'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import { archiveEmployeeFolder, getEmployeeFolderName, isDriveConfigured } from '@/lib/google-drive'
import { generateEmploymentLetter, generateConfirmationLetter } from '@/actions/letters'

/** Probation end = startDate + probationMonths (default 3). Null if no start date. */
function computeProbationEnd(startDate: Date | null | undefined, months: number | null | undefined): Date | null {
  if (!startDate) return null
  return addMonths(startDate, months ?? 3)
}

const CreateUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  employeeNumber: z.string().optional(),
  nric: z.string().optional(),
  passportNumber: z.string().optional(),
  passportExpiry: z.string().optional(),
  company: z.string().optional(),
  position: z.string().min(1, 'Position is required'),
  department: z.string().min(1, 'Department is required'),
  employmentType: z.enum(['EMPLOYEE', 'CONTRACTOR', 'PART_TIME'], {
    message: 'Employment type is required',
  }),
  country: z.enum(['SG', 'MY'], {
    message: 'Country is required',
  }),
  startDate: z.string().optional(),
  probationMonths: z.coerce.number().int().min(0).max(24).optional(),
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
    employeeNumber: formData.get('employeeNumber') || undefined,
    nric: formData.get('nric') || undefined,
    passportNumber: formData.get('passportNumber') || undefined,
    passportExpiry: formData.get('passportExpiry') || undefined,
    company: formData.get('company') || undefined,
    position: formData.get('position'),
    department: formData.get('department'),
    employmentType: formData.get('employmentType'),
    country: formData.get('country'),
    startDate: formData.get('startDate') || undefined,
    probationMonths: formData.get('probationMonths') || undefined,
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

  // Employee number uniqueness (manual entry)
  if (data.employeeNumber) {
    const dupe = await db.user.findUnique({ where: { employeeNumber: data.employeeNumber } })
    if (dupe) {
      return { errors: { employeeNumber: ['Employee ID already in use'] } }
    }
  }

  const passwordHash = await bcrypt.hash('changeme123', 12)

  const startDate = data.startDate ? new Date(data.startDate) : null
  const probationMonths = data.probationMonths ?? 3

  const user = await db.user.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      nationality: data.nationality,
      employeeNumber: data.employeeNumber || undefined,
      nric: data.nric || undefined,
      passportNumber: data.passportNumber || undefined,
      passportExpiry: data.passportExpiry ? new Date(data.passportExpiry) : undefined,
      company: data.company || undefined,
      position: data.position,
      department: data.department,
      employmentType: data.employmentType,
      country: data.country,
      startDate: startDate ?? undefined,
      probationMonths,
      probationEndDate: computeProbationEnd(startDate, probationMonths) ?? undefined,
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

  // Auto-draft the employment letter (lands in the HR review queue).
  // Never throws — a letter-generation failure must not block the hire.
  await generateEmploymentLetter(user.id)

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
  employeeNumber: z.string().optional(),
  nric: z.string().optional(),
  passportNumber: z.string().optional(),
  passportExpiry: z.string().optional(),
  company: z.string().optional(),
  position: z.string().optional(),
  department: z.string().optional(),
  employmentType: z.enum(['EMPLOYEE', 'CONTRACTOR', 'PART_TIME']),
  country: z.enum(['SG', 'MY']),
  startDate: z.string().optional(),
  probationMonths: z.coerce.number().int().min(0).max(24).optional(),
  reportingManagerId: z.string().optional(),
  role: z.enum(['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE', 'CONTRACTOR']),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED', 'REJECTED']),
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
    employeeNumber: formData.get('employeeNumber') || undefined,
    nric: formData.get('nric') || undefined,
    passportNumber: formData.get('passportNumber') || undefined,
    passportExpiry: formData.get('passportExpiry') || undefined,
    company: formData.get('company') || undefined,
    position: formData.get('position') || undefined,
    department: formData.get('department') || undefined,
    employmentType: formData.get('employmentType'),
    country: formData.get('country'),
    startDate: formData.get('startDate') || undefined,
    probationMonths: formData.get('probationMonths') || undefined,
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

  // Employee number uniqueness (excluding current user)
  if (data.employeeNumber) {
    const dupe = await db.user.findUnique({ where: { employeeNumber: data.employeeNumber } })
    if (dupe && dupe.id !== data.id) {
      return { errors: { employeeNumber: ['Employee ID already in use by another user'] } }
    }
  }

  const before = await db.user.findUnique({
    where: { id: data.id },
    select: {
      status: true, role: true, email: true, firstName: true, lastName: true,
      employeeNumber: true, folderArchivedAt: true, probationMonths: true, startDate: true,
    },
  })

  if (!before) {
    return { error: 'User not found' }
  }

  const startDate = data.startDate ? new Date(data.startDate) : null
  const probationMonths = data.probationMonths ?? before.probationMonths ?? 3

  // Status transitions that archive the employee's Drive folder.
  const ARCHIVING: string[] = ['TERMINATED', 'REJECTED']
  const becomingArchived =
    ARCHIVING.includes(data.status) && !ARCHIVING.includes(before.status)

  await db.user.update({
    where: { id: data.id },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone || null,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      nationality: data.nationality || null,
      employeeNumber: data.employeeNumber || null,
      nric: data.nric || null,
      passportNumber: data.passportNumber || null,
      passportExpiry: data.passportExpiry ? new Date(data.passportExpiry) : null,
      company: data.company || null,
      position: data.position || null,
      department: data.department || null,
      employmentType: data.employmentType,
      country: data.country,
      startDate,
      probationMonths,
      probationEndDate: computeProbationEnd(startDate, probationMonths),
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
      folderArchivedAt: becomingArchived ? new Date() : undefined,
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

  // Archive the Drive folder (best-effort) when the employee is rejected/terminated.
  if (becomingArchived && isDriveConfigured()) {
    try {
      const folderName = getEmployeeFolderName({
        firstName: data.firstName,
        lastName: data.lastName,
        employeeNumber: data.employeeNumber || before.employeeNumber,
        id: data.id,
      })
      await archiveEmployeeFolder(folderName)
      await createAuditLog({
        userId: session.userId,
        action: 'EMPLOYEE_FOLDER_ARCHIVED',
        entityType: 'USER',
        entityId: data.id,
        details: { reason: data.status },
      })
    } catch (err) {
      console.error('archiveEmployeeFolder error:', err)
    }
  }

  revalidatePath(`/people/${data.id}`)
  return { success: true }
}

// ============================================================
// Set / change confirmation date (probation → confirmation flow)
// ============================================================

export async function setConfirmationDate(
  userId: string,
  confirmationDate: string | null,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN' && session.role !== 'HR') {
      return { error: 'Permission denied' }
    }

    const date = confirmationDate ? new Date(confirmationDate) : null
    await db.user.update({
      where: { id: userId },
      data: { confirmationDate: date },
    })

    await createAuditLog({
      userId: session.userId,
      action: 'CONFIRMATION_DATE_SET',
      entityType: 'USER',
      entityId: userId,
      details: { confirmationDate: date?.toISOString() ?? null },
    })

    // Setting a confirmation date kicks off the confirmation-letter flow
    // (HR review → boss signs → sent on the date). Clearing it leaves any
    // existing letter as-is.
    if (date) {
      await generateConfirmationLetter(userId, date)
    }

    revalidatePath(`/people/${userId}`)
    return { success: true }
  } catch (err) {
    console.error('setConfirmationDate error:', err)
    return { error: 'Failed to set confirmation date.' }
  }
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
