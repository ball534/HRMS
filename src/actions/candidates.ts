'use server'

import { randomBytes, randomInt } from 'node:crypto'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { verifySession, requireCapability } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { putChecked, FileTooLargeError } from '@/lib/storage'
import { sendEmail } from '@/lib/email'
import { notifyHr } from '@/lib/notify'
import { DEPARTMENTS } from '@/lib/departments'
import { generateEmploymentLetter } from '@/actions/letters'
import { LETTER_KINDS, type LetterKindName } from '@/lib/letterSections'

/**
 * The hiring pipeline.
 *
 * An application arrives from the public form as a `Candidate` — deliberately
 * not a `User`. Most applicants will not be hired, and giving each of them an
 * account, even a disabled one, would put strangers in the employee directory,
 * the org chart and every "all active users" query in the app.
 *
 * Recording a passed interview is the moment that changes: it creates the
 * account, emails the temporary password, and drafts the employment letter, in
 * that order, so a failure at the letter step still leaves a usable account.
 */

export type CandidateActionState = { success?: boolean; error?: string; errors?: Record<string, string[]> }

// ============================================================
// Who may see which applications
// ============================================================

/**
 * Managers are the interviewers, so they hold `candidates.read` and
 * `candidates.write` — but only over their own department.
 *
 * `all: true` is HR: every application, and the only role that can finish a hire
 * (that needs `people.write`). For anyone else `department` is what they may
 * touch, and a null department means they may touch nothing — better than
 * falling back to "everything" for a manager whose own record is incomplete.
 */
type CandidateScope = { userId: string; role: string; all: boolean; department: string | null }

async function candidateScope(capability: 'candidates.read' | 'candidates.write'): Promise<CandidateScope> {
  const session = await requireCapability(capability)

  if (can(session.role, 'people.read.directory')) {
    return { userId: session.userId, role: session.role, all: true, department: null }
  }

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { department: true },
  })
  return {
    userId: session.userId,
    role: session.role,
    all: false,
    department: me?.department ?? null,
  }
}

/** Is this application inside the caller's scope? */
function inScope(scope: CandidateScope, candidateDepartment: string | null): boolean {
  if (scope.all) return true
  if (!scope.department) return false
  return candidateDepartment === scope.department
}

const OUT_OF_SCOPE = 'That application is for another department.'

// ============================================================
// The public application form
// ============================================================

const APPLICATION_MAX_RESUME_MB = 5
const RESUME_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

const ApplicationSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(80),
  lastName: z.string().min(1, 'Last name is required').max(80),
  email: z.string().email('Enter a valid email address').max(200),
  phone: z.string().min(6, 'Phone number is required').max(40),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  nationality: z.string().min(1, 'Nationality is required').max(80),
  citizenship: z.enum(['SG_CITIZEN', 'SG_PR', 'FOREIGNER'], {
    message: 'Tell us your citizenship status',
  }),
  positionApplied: z.string().min(1, 'Tell us the role you are applying for').max(120),
  department: z.string().max(60).optional(),
  employmentTypeWanted: z.enum(['EMPLOYEE', 'CONTRACTOR', 'PART_TIME']).optional(),
  earliestStartDate: z.string().optional(),
})

/**
 * Submit an application. Unauthenticated by design — this is the form on the job
 * ad, and requiring a login to apply for a job would be absurd.
 *
 * Two cheap defences against the obvious abuse, given there is no captcha:
 * a honeypot field real people never fill in, and a per-email rate limit that
 * stops the same address filing applications in a loop.
 */
export async function submitApplication(
  _state: CandidateActionState,
  formData: FormData,
): Promise<CandidateActionState> {
  try {
    // Honeypot. A bot fills every field it finds; a person never sees this one.
    if ((formData.get('website') as string | null)?.trim()) {
      // Report success so the bot has nothing to learn from the response.
      return { success: true }
    }

    const parsed = ApplicationSchema.safeParse({
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      dateOfBirth: formData.get('dateOfBirth'),
      nationality: formData.get('nationality'),
      citizenship: formData.get('citizenship'),
      positionApplied: formData.get('positionApplied'),
      department: formData.get('department') || undefined,
      employmentTypeWanted: formData.get('employmentTypeWanted') || undefined,
      earliestStartDate: formData.get('earliestStartDate') || undefined,
    })
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data

    const email = data.email.trim().toLowerCase()

    // Rate limit: one open application per address at a time.
    const recent = await db.candidate.findFirst({
      where: {
        email,
        status: { in: ['NEW', 'FOR_INTERVIEW'] },
      },
      select: { id: true },
    })
    if (recent) {
      return {
        error:
          'We already have an application from this email address that we are still looking at. Please wait for us to come back to you.',
      }
    }

    // Résumé, if attached. Kept small deliberately — this is an unauthenticated
    // endpoint writing to our database.
    let resume: { blobId: string; fileName: string } | null = null
    const file = formData.get('resume')
    if (file instanceof File && file.size > 0) {
      if (file.size > APPLICATION_MAX_RESUME_MB * 1024 * 1024) {
        return { errors: { resume: [`Please keep your CV under ${APPLICATION_MAX_RESUME_MB} MB.`] } }
      }
      if (!RESUME_TYPES.includes(file.type)) {
        return { errors: { resume: ['Attach your CV as a PDF or Word document.'] } }
      }
      try {
        const stored = await putChecked(Buffer.from(await file.arrayBuffer()), file.type)
        resume = { blobId: stored.blobId, fileName: file.name }
      } catch (err) {
        if (err instanceof FileTooLargeError) {
          return { errors: { resume: [err.message] } }
        }
        throw err
      }
    }

    const candidate = await db.candidate.create({
      data: {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email,
        phone: data.phone.trim(),
        dateOfBirth: new Date(data.dateOfBirth),
        nationality: data.nationality.trim(),
        citizenship: data.citizenship,
        positionApplied: data.positionApplied.trim(),
        department: DEPARTMENTS.includes(data.department as (typeof DEPARTMENTS)[number])
          ? data.department
          : null,
        employmentTypeWanted: data.employmentTypeWanted,
        earliestStartDate: data.earliestStartDate ? new Date(data.earliestStartDate) : null,
        resumeBlobId: resume?.blobId,
        resumeFileName: resume?.fileName,
      },
    })

    // No audit row for the submission itself: `AuditLog.userId` is a foreign key
    // to a real account, and an applicant does not have one. The Candidate row's
    // own `createdAt` is the record that it arrived, and HR is told immediately.
    await notifyHr({
      type: 'CANDIDATE_APPLIED',
      title: `New application: ${candidate.firstName} ${candidate.lastName}`,
      body: `Applied for ${candidate.positionApplied}${
        candidate.department ? ` in ${candidate.department}` : ''
      }.`,
      linkUrl: `/candidates/${candidate.id}`,
    })

    revalidatePath('/candidates')
    return { success: true }
  } catch (err) {
    console.error('submitApplication error:', err)
    return { error: 'Something went wrong sending your application. Please try again.' }
  }
}

// ============================================================
// HR pipeline actions
// ============================================================

/** Shortlist: this one is worth interviewing. */
export async function sendToInterview(candidateId: string): Promise<CandidateActionState> {
  try {
    const scope = await candidateScope('candidates.write')
    const candidate = await db.candidate.findUnique({ where: { id: candidateId } })
    if (!candidate) return { error: 'Candidate not found.' }
    if (!inScope(scope, candidate.department)) return { error: OUT_OF_SCOPE }
    if (candidate.status !== 'NEW') {
      return { error: 'Only a new application can be sent to interview.' }
    }

    await db.candidate.update({
      where: { id: candidateId },
      data: { status: 'FOR_INTERVIEW', sentToInterviewAt: new Date(), decidedById: scope.userId },
    })
    await createAuditLog({
      userId: scope.userId,
      action: 'CANDIDATE_SENT_TO_INTERVIEW',
      entityType: 'CANDIDATE',
      entityId: candidateId,
    })

    revalidatePath('/candidates')
    revalidatePath(`/candidates/${candidateId}`)
    return { success: true }
  } catch (err) {
    console.error('sendToInterview error:', err)
    return { error: 'Failed to update the candidate.' }
  }
}

/** Not proceeding — at any stage, with the reason kept on the record. */
export async function archiveCandidate(
  candidateId: string,
  notes?: string,
): Promise<CandidateActionState> {
  try {
    const scope = await candidateScope('candidates.write')
    const candidate = await db.candidate.findUnique({ where: { id: candidateId } })
    if (!candidate) return { error: 'Candidate not found.' }
    if (!inScope(scope, candidate.department)) return { error: OUT_OF_SCOPE }
    if (candidate.status === 'PASSED') {
      return { error: 'This candidate has already been hired.' }
    }

    await db.candidate.update({
      where: { id: candidateId },
      data: {
        status: 'ARCHIVED',
        decidedAt: new Date(),
        decidedById: scope.userId,
        notes: notes?.trim() ? notes.trim() : candidate.notes,
      },
    })
    await createAuditLog({
      userId: scope.userId,
      action: 'CANDIDATE_ARCHIVED',
      entityType: 'CANDIDATE',
      entityId: candidateId,
      details: { notes: notes?.trim() || null },
    })

    revalidatePath('/candidates')
    revalidatePath(`/candidates/${candidateId}`)
    return { success: true }
  } catch (err) {
    console.error('archiveCandidate error:', err)
    return { error: 'Failed to archive the candidate.' }
  }
}

/** Interview notes, saved without deciding anything. */
export async function saveCandidateNotes(
  candidateId: string,
  notes: string,
): Promise<CandidateActionState> {
  try {
    const scope = await candidateScope('candidates.write')
    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: { department: true },
    })
    if (!candidate) return { error: 'Candidate not found.' }
    if (!inScope(scope, candidate.department)) return { error: OUT_OF_SCOPE }

    await db.candidate.update({
      where: { id: candidateId },
      data: { notes: notes.trim() || null },
    })
    await createAuditLog({
      userId: scope.userId,
      action: 'CANDIDATE_UPDATED',
      entityType: 'CANDIDATE',
      entityId: candidateId,
      details: { notesEdited: true },
    })
    revalidatePath(`/candidates/${candidateId}`)
    return { success: true }
  } catch (err) {
    console.error('saveCandidateNotes error:', err)
    return { error: 'Failed to save the notes.' }
  }
}

// ============================================================
// Passing the interview — the moment a candidate becomes an employee
// ============================================================

/**
 * A password that satisfies the app's own rules, is awkward to guess, and can
 * be read aloud over a phone if the email goes astray.
 */
function temporaryPassword(): string {
  const words = ['Harbour', 'Orchid', 'Lantern', 'Marina', 'Compass', 'Willow', 'Summit', 'Quartz']
  const word = words[randomInt(words.length)]
  const digits = randomInt(1000, 9999)
  const suffix = randomBytes(2).toString('hex')
  return `${word}-${digits}-${suffix}`
}

const HireSchema = z.object({
  candidateId: z.string().min(1),
  position: z.string().min(1, 'Position is required').max(120),
  department: z.string().min(1, 'Department is required'),
  employmentType: z.enum(['EMPLOYEE', 'CONTRACTOR']),
  role: z.enum(['HR', 'MANAGER', 'EMPLOYEE', 'PARTTIME']),
  country: z.enum(['SG', 'MY']),
  employeeNumber: z.string().max(40).optional(),
  startDate: z.string().min(1, 'Start date is required'),
  probationMonths: z.coerce.number().int().min(0).max(24).optional(),
  reportingManagerId: z.string().optional(),
  letterKind: z.enum(LETTER_KINDS).optional(),
  hourlyRate: z.coerce.number().min(0).optional(),
  hourlyRateWeekday: z.coerce.number().min(0).optional(),
  hourlyRateSaturday: z.coerce.number().min(0).optional(),
  hourlyRateSundayPh: z.coerce.number().min(0).optional(),
  hourlyRateWeekend: z.coerce.number().min(0).optional(),
})

/**
 * Record that the interview was passed: create the account, email the temporary
 * password, draft the employment letter.
 *
 * Ordered so the expensive, fallible parts come last. If the email fails the
 * caller is told plainly — the account exists and HR can trigger a password
 * reset — and if the letter fails, the hire still stands and HR can redraft.
 */
export async function passInterview(
  _state: CandidateActionState,
  formData: FormData,
): Promise<CandidateActionState> {
  const session = await verifySession()
  if (!can(session.role, 'candidates.write') || !can(session.role, 'people.write')) {
    return { error: 'Permission denied: you cannot hire a candidate.' }
  }

  const parsed = HireSchema.safeParse({
    candidateId: formData.get('candidateId'),
    position: formData.get('position'),
    department: formData.get('department'),
    employmentType: formData.get('employmentType'),
    role: formData.get('role'),
    country: formData.get('country'),
    employeeNumber: formData.get('employeeNumber') || undefined,
    startDate: formData.get('startDate'),
    probationMonths: formData.get('probationMonths') || undefined,
    reportingManagerId: formData.get('reportingManagerId') || undefined,
    letterKind: formData.get('letterKind') || undefined,
    hourlyRate: formData.get('hourlyRate') || undefined,
    hourlyRateWeekday: formData.get('hourlyRateWeekday') || undefined,
    hourlyRateSaturday: formData.get('hourlyRateSaturday') || undefined,
    hourlyRateSundayPh: formData.get('hourlyRateSundayPh') || undefined,
    hourlyRateWeekend: formData.get('hourlyRateWeekend') || undefined,
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }
  const data = parsed.data

  const candidate = await db.candidate.findUnique({ where: { id: data.candidateId } })
  if (!candidate) return { error: 'Candidate not found.' }
  if (candidate.status === 'PASSED') return { error: 'This candidate has already been hired.' }
  if (candidate.status === 'ARCHIVED') {
    return { error: 'This application was archived. Reopen it before hiring.' }
  }

  const emailTaken = await db.user.findUnique({ where: { email: candidate.email } })
  if (emailTaken) {
    return {
      error: `${candidate.email} already has an account. Link the existing employee record instead of hiring again.`,
    }
  }
  if (data.employeeNumber) {
    const dupe = await db.user.findUnique({ where: { employeeNumber: data.employeeNumber } })
    if (dupe) return { errors: { employeeNumber: ['Employee ID already in use'] } }
  }

  const password = temporaryPassword()
  const passwordHash = await bcrypt.hash(password, 12)
  const startDate = new Date(data.startDate)
  const probationMonths = data.probationMonths ?? 3
  const probationEndDate = new Date(startDate)
  probationEndDate.setMonth(probationEndDate.getMonth() + probationMonths)

  const user = await db.user.create({
    data: {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
      dateOfBirth: candidate.dateOfBirth,
      nationality: candidate.nationality,
      citizenship: candidate.citizenship,
      employeeNumber: data.employeeNumber || undefined,
      position: data.position,
      department: data.department,
      // Part-time status comes from the role, as everywhere else in the app.
      employmentType: data.role === 'PARTTIME' ? 'PART_TIME' : data.employmentType,
      role: data.role,
      country: data.country,
      startDate,
      probationMonths,
      probationEndDate,
      reportingManagerId: data.reportingManagerId || undefined,
      hourlyRate: data.hourlyRate ?? null,
      hourlyRateWeekday: data.hourlyRateWeekday ?? null,
      hourlyRateSaturday: data.hourlyRateSaturday ?? null,
      hourlyRateSundayPh: data.hourlyRateSundayPh ?? null,
      hourlyRateWeekend: data.hourlyRateWeekend ?? null,
      passwordHash,
      mustChangePassword: true,
      status: 'ACTIVE',
    },
  })

  await db.candidate.update({
    where: { id: candidate.id },
    data: {
      status: 'PASSED',
      decidedAt: new Date(),
      decidedById: session.userId,
      hiredUserId: user.id,
    },
  })

  await db.careerEvent.create({
    data: {
      userId: user.id,
      type: 'JOINED',
      title: `Joined as ${data.position}`,
      detail: data.department,
      effectiveDate: startDate,
    },
  })

  await createAuditLog({
    userId: session.userId,
    action: 'CANDIDATE_PASSED',
    entityType: 'CANDIDATE',
    entityId: candidate.id,
    details: { hiredUserId: user.id, role: data.role, department: data.department },
  })
  await createAuditLog({
    userId: session.userId,
    action: 'USER_CREATED',
    entityType: 'USER',
    entityId: user.id,
    details: { after: { email: user.email, role: user.role, country: user.country }, fromCandidate: candidate.id },
  })

  // Credentials go by email only, and are never written to a notification row —
  // an in-app copy would leave the password sitting in the database in plain
  // text long after it was needed.
  let emailFailure: string | null = null
  try {
    await sendEmail({
      to: user.email,
      subject: 'Welcome to IORA Group — your HR account',
      html: welcomeEmailHtml({
        firstName: user.firstName,
        position: data.position,
        department: data.department,
        startDate,
        email: user.email,
        password,
      }),
    })
  } catch (err) {
    emailFailure = err instanceof Error ? err.message : String(err)
    console.error('[candidates] welcome email failed:', emailFailure)
  }

  // Letter last: a failure here is recoverable by hand, and must not undo a hire.
  await generateEmploymentLetter(user.id, data.letterKind as LetterKindName | undefined)

  revalidatePath('/candidates')
  revalidatePath(`/candidates/${candidate.id}`)
  revalidatePath('/people')
  revalidatePath('/letters')

  if (emailFailure) {
    return {
      error:
        `${user.firstName}'s account and letter were created, but the welcome email could not be sent ` +
        `(${emailFailure}). Use “Reset password” on their profile to send them a set-password link instead.`,
    }
  }

  return { success: true }
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function welcomeEmailHtml(opts: {
  firstName: string
  position: string
  department: string
  startDate: Date
  email: string
  password: string
}): string {
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;max-width:520px">
  <h2 style="margin:0 0 12px">Congratulations, ${escapeHtml(opts.firstName)}!</h2>
  <p style="margin:0 0 12px">
    We are delighted to offer you the position of <strong>${escapeHtml(opts.position)}</strong> in
    ${escapeHtml(opts.department)}, starting ${fmtDate(opts.startDate)}.
  </p>
  <p style="margin:0 0 12px">
    We have created your HR account. Sign in to read and sign your employment letter, and to send us
    the documents we need to add you to payroll.
  </p>
  <table style="margin:16px 0;border-collapse:collapse">
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Email</td><td><strong>${escapeHtml(opts.email)}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Temporary password</td><td><strong>${escapeHtml(opts.password)}</strong></td></tr>
  </table>
  <p style="margin:0 0 12px">
    You will be asked to choose your own password the first time you sign in. This temporary one stops
    working at that point.
  </p>
  ${appUrl ? `<p style="margin:16px 0"><a href="${appUrl}/login" style="display:inline-block;padding:10px 20px;background:#6d28d9;color:#fff;text-decoration:none;border-radius:6px">Sign in</a></p>` : ''}
  <p style="margin:24px 0 0;color:#6b7280;font-size:12px">
    If you were not expecting this email, please let our HR team know.
  </p>
</div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ============================================================
// Queries
// ============================================================

export async function listCandidates(status?: string) {
  const scope = await candidateScope('candidates.read')
  if (!scope.all && !scope.department) return []

  const valid = ['NEW', 'FOR_INTERVIEW', 'PASSED', 'ARCHIVED']
  return db.candidate.findMany({
    where: {
      ...(status && valid.includes(status) ? { status: status as 'NEW' } : {}),
      ...(scope.all ? {} : { department: scope.department }),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      positionApplied: true,
      department: true,
      employmentTypeWanted: true,
      citizenship: true,
      earliestStartDate: true,
      status: true,
      createdAt: true,
      hiredUserId: true,
    },
    orderBy: [{ createdAt: 'desc' }],
  })
}

export async function getCandidate(candidateId: string) {
  const scope = await candidateScope('candidates.read')
  const candidate = await db.candidate.findUnique({
    where: { id: candidateId },
    include: {
      decidedBy: { select: { firstName: true, lastName: true } },
      hiredUser: { select: { id: true, firstName: true, lastName: true } },
    },
  })
  if (!candidate) return null
  // Out of scope reads as "no such application" rather than "not yours", so
  // walking ids tells a manager nothing about other departments' hiring.
  return inScope(scope, candidate.department) ? candidate : null
}

/** Counts for the pipeline tabs. */
export async function candidateCounts(): Promise<Record<string, number>> {
  const scope = await candidateScope('candidates.read')
  if (!scope.all && !scope.department) return {}

  const rows = await db.candidate.groupBy({
    by: ['status'],
    where: scope.all ? undefined : { department: scope.department },
    _count: { _all: true },
  })
  return Object.fromEntries(rows.map(r => [r.status, r._count._all]))
}
