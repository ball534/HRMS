'use server'

import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { addMonths } from 'date-fns'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { generateEmploymentLetter, generateConfirmationLetter } from '@/actions/letters'

/** Probation end = startDate + probationMonths (default 3). Null if no start date. */
function computeProbationEnd(startDate: Date | null | undefined, months: number | null | undefined): Date | null {
  if (!startDate) return null
  return addMonths(startDate, months ?? 3)
}

/**
 * Would making `managerId` the manager of `employeeId` create a reporting loop?
 *
 * Walks up from the proposed manager: if we reach the employee, the employee is
 * already somewhere above that manager and the assignment would close a cycle.
 * Returns a readable description of the loop, or null if the assignment is safe.
 *
 * Cycles were previously prevented only by a client-side dropdown filter, so
 * A→B plus B→A was reachable through the normal UI. A cycle corrupts approval
 * routing and makes d3's `stratify` throw when rendering the org chart.
 */
async function createsReportingCycle(employeeId: string, managerId: string): Promise<string | null> {
  const chain: string[] = []
  let cursor: string | null = managerId
  const seen = new Set<string>()

  while (cursor) {
    if (seen.has(cursor)) break // pre-existing cycle elsewhere; don't spin
    seen.add(cursor)

    const node: { id: string; firstName: string; lastName: string; reportingManagerId: string | null } | null =
      await db.user.findUnique({
        where: { id: cursor },
        select: { id: true, firstName: true, lastName: true, reportingManagerId: true },
      })
    if (!node) break

    chain.push(`${node.firstName} ${node.lastName}`)
    if (node.id === employeeId) return chain.join(' → ')

    cursor = node.reportingManagerId
  }

  return null
}

/**
 * Fields whose values must never be written into an audit log in cleartext.
 * The change is recorded — that this person's NRIC was edited, by whom, when —
 * but the numbers themselves are not duplicated into a second table.
 */
const REDACTED_AUDIT_FIELDS = new Set(['nric', 'passportNumber'])

/**
 * Per-field before/after diff for the audit log.
 *
 * `USER_UPDATED` used to record only `{ before: {status, role}, after: {...} }`,
 * which meant "who changed this employee's NRIC, and when?" — exactly the kind
 * of question an audit log exists to answer — was unanswerable.
 */
function diffUserFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from?: unknown; to?: unknown; changed?: true }> {
  const changed: Record<string, { from?: unknown; to?: unknown; changed?: true }> = {}

  for (const key of Object.keys(after)) {
    const b = normaliseForDiff(before[key])
    const a = normaliseForDiff(after[key])
    if (b === a) continue

    changed[key] = REDACTED_AUDIT_FIELDS.has(key) ? { changed: true } : { from: b, to: a }
  }

  return changed
}

/** Dates → ISO date, empty string → null, so cosmetic differences don't register. */
function normaliseForDiff(v: unknown): unknown {
  if (v === undefined || v === '') return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return v
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

  if (!can(session.role, 'people.write')) {
    return { error: 'Permission denied: you cannot create employee records' }
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

  // Journey: starting node of the employee's career timeline.
  await db.careerEvent.create({
    data: {
      userId: user.id,
      type: 'JOINED',
      title: `Joined as ${data.position}`,
      detail: data.department,
      toValue: data.position,
      effectiveDate: startDate ?? new Date(),
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

  if (!can(session.role, 'people.write')) {
    return { error: 'Permission denied: you cannot edit employee records' }
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
      position: true, department: true, phone: true, dateOfBirth: true, nationality: true,
      nric: true, passportNumber: true, passportExpiry: true, company: true,
      employmentType: true, country: true, reportingManagerId: true,
    },
  })

  if (!before) {
    return { error: 'User not found' }
  }

  // ---- Guards on the sensitive fields -----------------------------------
  //
  // Role and status are the two fields that decide what someone can do and
  // whether they can log in at all, so changing them is an ADMIN act even
  // though HR may edit everything else on the record.
  const changingRole = data.role !== before.role
  const changingStatus = data.status !== before.status
  if ((changingRole || changingStatus) && !can(session.role, 'people.write.role')) {
    return {
      error: changingRole
        ? 'Only an administrator can change someone\'s role.'
        : 'Only an administrator can change someone\'s status. Use the offboarding flow to terminate an employee.',
    }
  }

  // Terminating must go through the offboarding flow, which reassigns reports,
  // re-routes the approval queue, prorates leave and flags work passes. Setting
  // the status straight to TERMINATED from this form would skip all of it and
  // leave the same mess this release exists to clean up.
  if (data.status === 'TERMINATED' && before.status !== 'TERMINATED') {
    return {
      error:
        'Use the "Offboard employee" action to terminate someone — it reassigns their reports and approvals, prorates their leave and flags their work passes. Changing the status here would skip all of that.',
    }
  }

  // Nothing used to stop the last ADMIN demoting or deactivating themselves —
  // one click locked the whole Group out of every admin function with no
  // in-app way back.
  if (before.role === 'ADMIN' && (changingRole || data.status !== 'ACTIVE')) {
    const otherActiveAdmins = await db.user.count({
      where: { role: 'ADMIN', status: 'ACTIVE', id: { not: data.id } },
    })
    if (otherActiveAdmins === 0) {
      return {
        error:
          'This is the only active administrator. Promote someone else to ADMIN first, or nobody will be able to administer the system.',
      }
    }
  }

  // Reporting-manager cycles (A reports to B, B reports to A) were only
  // prevented by a client-side dropdown filter, and a cycle corrupts approval
  // routing and makes the org chart unrenderable.
  if (data.reportingManagerId && data.reportingManagerId !== before.reportingManagerId) {
    if (data.reportingManagerId === data.id) {
      return { errors: { reportingManagerId: ['Someone cannot report to themselves'] } }
    }
    const cycle = await createsReportingCycle(data.id, data.reportingManagerId)
    if (cycle) {
      return {
        errors: {
          reportingManagerId: [
            `That would create a reporting loop (${cycle}). Pick a manager who is not below this employee.`,
          ],
        },
      }
    }
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
      changed: diffUserFields(before as unknown as Record<string, unknown>, {
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
        reportingManagerId: data.reportingManagerId || null,
        role: data.role,
        status: data.status,
      }),
    },
  })

  // Journey: record position/department moves and departure as career events.
  const journeyEvents: {
    userId: string
    type: 'POSITION_CHANGE' | 'DEPARTMENT_CHANGE' | 'TERMINATED'
    title: string
    detail?: string | null
    fromValue?: string | null
    toValue?: string | null
    effectiveDate: Date
  }[] = []
  if (data.position && data.position !== before.position) {
    journeyEvents.push({
      userId: data.id,
      type: 'POSITION_CHANGE',
      title: before.position ? `Moved to ${data.position}` : `Became ${data.position}`,
      detail: data.department ?? null,
      fromValue: before.position,
      toValue: data.position,
      effectiveDate: new Date(),
    })
  }
  if (data.department && data.department !== before.department) {
    journeyEvents.push({
      userId: data.id,
      type: 'DEPARTMENT_CHANGE',
      title: `Transferred to ${data.department}`,
      detail: data.position ?? null,
      fromValue: before.department,
      toValue: data.department,
      effectiveDate: new Date(),
    })
  }
  if (data.status === 'TERMINATED' && before.status !== 'TERMINATED') {
    journeyEvents.push({
      userId: data.id,
      type: 'TERMINATED',
      title: 'Left the company',
      detail: data.position ?? null,
      effectiveDate: new Date(),
    })
  }
  if (journeyEvents.length > 0) {
    await db.careerEvent.createMany({ data: journeyEvents })
  }

  // There is no folder to archive any more. Documents live in Postgres keyed by
  // `employeeId`, so a leaver's records are already exactly where they were and
  // are retained by default — which is what statutory record-keeping wants.
  // `folderArchivedAt` and the EMPLOYEE_FOLDER_ARCHIVED audit action are legacy
  // and no longer written. What is still open (oversight.md §10) is that the HR
  // document browser only lists ACTIVE employees, so those retained records
  // aren't reachable through the UI.
  if (becomingArchived) {
    await createAuditLog({
      userId: session.userId,
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: data.id,
      details: { documentsRetained: true, reason: data.status },
    })
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
    if (!can(session.role, 'people.write')) {
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

    // Journey: keep a single CONFIRMED milestone in sync with the date.
    await db.careerEvent.deleteMany({ where: { userId, type: 'CONFIRMED' } })
    if (date) {
      await db.careerEvent.create({
        data: {
          userId,
          type: 'CONFIRMED',
          title: 'Confirmed as a permanent employee',
          detail: 'Completed probation',
          effectiveDate: date,
        },
      })
    }

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

  if (!can(session.role, 'people.reset_password')) {
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
