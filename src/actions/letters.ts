'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { verifySession, requireCapability } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { storage, putChecked } from '@/lib/storage'
import { renderLetterPdf } from '@/lib/letterPdf'
import { getSetting } from '@/lib/settings'
import { notify, notifyHr } from '@/lib/notify'
import { deliverLetter } from '@/lib/notifications'
import {
  LETTER_KINDS,
  LETTER_KIND_LABELS,
  confirmationSections,
  defaultSectionsFor,
  deriveLetterKind,
  mergeText,
  parseSections,
  type LetterKindName,
  type LetterSection,
} from '@/lib/letterSections'
import type { User } from '@/generated/prisma/client'

export type LetterActionState = { success?: boolean; error?: string }

// ============================================================
// Helpers (internal)
// ============================================================

function fmtDate(d: Date | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function fmtMoney(value: unknown): string {
  if (value === null || value === undefined) return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return n.toFixed(2)
}

function isHr(role: string): boolean {
  return can(role, 'letters.write')
}

/** Values a section body may reference as `{{field}}`. */
function buildMergeValues(employee: User, officerName?: string): Record<string, string> {
  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    fullName: `${employee.firstName} ${employee.lastName}`,
    employeeNumber: employee.employeeNumber ?? '',
    nric: employee.nric ?? '',
    passportNumber: employee.passportNumber ?? '',
    position: employee.position ?? '',
    department: employee.department ?? '',
    company: employee.company ?? 'IORA Group',
    country: employee.country === 'MY' ? 'Malaysia' : 'Singapore',
    email: employee.email,
    startDate: fmtDate(employee.startDate),
    probationMonths: String(employee.probationMonths ?? 3),
    probationEndDate: fmtDate(employee.probationEndDate),
    confirmationDate: fmtDate(employee.confirmationDate),
    today: fmtDate(new Date()),
    approvingOfficerName: officerName ?? '',
    hourlyRate: fmtMoney(employee.hourlyRate),
    hourlyRateWeekday: fmtMoney(employee.hourlyRateWeekday),
    hourlyRateSaturday: fmtMoney(employee.hourlyRateSaturday),
    hourlyRateSundayPh: fmtMoney(employee.hourlyRateSundayPh),
    hourlyRateWeekend: fmtMoney(employee.hourlyRateWeekend),
  }
}

/** Resolve the merge fields in a default section set for this employee. */
function draftSections(sections: LetterSection[], employee: User): LetterSection[] {
  const values = buildMergeValues(employee)
  return sections.map(s => ({
    id: s.id,
    title: mergeText(s.title, values),
    body: mergeText(s.body, values),
  }))
}

/** The signatory configured for this employee's department, if they're still active. */
async function defaultSignatoryFor(department: string | null): Promise<string | null> {
  if (!department) return null
  const map = await getSetting('letters.departmentSignatories')
  const candidate = map?.[department]
  if (!candidate) return null

  const signatory = await db.user.findUnique({
    where: { id: candidate },
    select: { id: true, status: true },
  })
  return signatory?.status === 'ACTIVE' ? signatory.id : null
}

/**
 * Draw the PDF for a letter as it currently stands and store it, replacing
 * whatever PDF the letter had. Returns the new blob id, or null if drawing
 * failed — a letter without a PDF is still a letter, and HR can regenerate.
 */
async function storeLetterPdf(letterId: string): Promise<string | null> {
  const letter = await db.employmentLetter.findUnique({
    where: { id: letterId },
    include: {
      employee: true,
      approvingOfficer: { select: { firstName: true, lastName: true, position: true } },
    },
  })
  if (!letter) return null

  try {
    const sections = parseSections(letter.sections)
    const officerName = letter.approvingOfficer
      ? `${letter.approvingOfficer.firstName} ${letter.approvingOfficer.lastName}`
      : ''

    const heading =
      letter.type === 'CONFIRMATION' ? 'LETTER OF CONFIRMATION' : 'LETTER OF EMPLOYMENT'
    const kindLabel = letter.kind ? LETTER_KIND_LABELS[letter.kind as LetterKindName] : null

    const pdf = await renderLetterPdf({
      heading,
      subheading: [letter.employee.company ?? 'IORA Group', kindLabel].filter(Boolean).join(' · '),
      reference: [
        `Date: ${fmtDate(new Date())}`,
        letter.employee.employeeNumber ? `Employee ID: ${letter.employee.employeeNumber}` : '',
        `Name: ${letter.employee.firstName} ${letter.employee.lastName}`,
      ].filter(Boolean),
      sections,
      signatoryName: officerName,
      signatoryPosition: letter.approvingOfficer?.position ?? undefined,
      employeeName: `${letter.employee.firstName} ${letter.employee.lastName}`,
      signatorySignatureDataUrl: letter.signatureDataUrl,
      employeeSignatureDataUrl: letter.employeeSignatureDataUrl,
    })

    const stored = await putChecked(pdf, 'application/pdf')
    const previousBlobId = letter.blobId

    await db.employmentLetter.update({
      where: { id: letterId },
      data: { blobId: stored.blobId },
    })

    // The superseded draft keeps no reference. Content addressing means a
    // regeneration that changed nothing hands back the same blob, so only
    // release when it is genuinely a different one.
    if (previousBlobId && previousBlobId !== stored.blobId) {
      await releaseUnlessFiled(previousBlobId)
    }

    return stored.blobId
  } catch (err) {
    console.error('[letters] could not render PDF:', err)
    return null
  }
}

/**
 * Drop a letter's reference to an old PDF — unless a Document row still points
 * at those bytes, which is the case once the signed letter has been filed in
 * the employee's folder.
 */
async function releaseUnlessFiled(blobId: string): Promise<void> {
  const filed = await db.document.count({ where: { blobId } })
  if (filed > 0) return
  await storage.release(blobId)
}

// ============================================================
// Generation
// ============================================================

/**
 * Draft the employment letter for a newly hired employee.
 *
 * Called from the hiring flow (candidate interview passed) and when HR creates
 * an employee by hand. Never throws — a letter failing must not undo the hire.
 */
export async function generateEmploymentLetter(
  employeeId: string,
  kindOverride?: LetterKindName,
): Promise<void> {
  try {
    const employee = await db.user.findUnique({ where: { id: employeeId } })
    if (!employee) return

    const existing = await db.employmentLetter.findFirst({
      where: { employeeId, type: 'EMPLOYMENT' },
    })
    if (existing) return // don't duplicate

    const kind =
      kindOverride ??
      deriveLetterKind({
        employmentType: employee.employmentType,
        department: employee.department,
        position: employee.position,
      })

    const letter = await db.employmentLetter.create({
      data: {
        employeeId,
        type: 'EMPLOYMENT',
        kind,
        status: 'PENDING_REVIEW',
        sections: draftSections(defaultSectionsFor(kind), employee),
        approvingOfficerId: await defaultSignatoryFor(employee.department),
      },
    })

    await storeLetterPdf(letter.id)

    await createAuditLog({
      userId: employeeId,
      action: 'EMPLOYMENT_LETTER_GENERATED',
      entityType: 'EMPLOYMENT_LETTER',
      entityId: letter.id,
      details: { kind },
    })
    await notifyHr({
      type: 'LETTER_READY_FOR_ACTION',
      title: `Employment letter drafted for ${employee.firstName} ${employee.lastName}`,
      body: `A ${LETTER_KIND_LABELS[kind]} letter is waiting for review before it goes to the signatory.`,
      linkUrl: `/letters/${letter.id}`,
    })
    revalidatePath('/letters')
  } catch (err) {
    console.error('generateEmploymentLetter error:', err)
  }
}

/**
 * Create (or refresh the due date of) the confirmation letter for an employee.
 * Called when HR sets/updates the confirmation date.
 */
export async function generateConfirmationLetter(
  employeeId: string,
  dueDate: Date,
): Promise<void> {
  try {
    const employee = await db.user.findUnique({ where: { id: employeeId } })
    if (!employee) return

    const existing = await db.employmentLetter.findFirst({
      where: { employeeId, type: 'CONFIRMATION', status: { notIn: ['REJECTED', 'DECLINED'] } },
    })

    if (existing) {
      // Already exists — just keep the due date in sync, reset overdue.
      await db.employmentLetter.update({
        where: { id: existing.id },
        data: {
          dueDate,
          overdue: false,
          status: existing.status === 'OVERDUE' ? 'PENDING_SIGNATURE' : existing.status,
        },
      })
      return
    }

    const letter = await db.employmentLetter.create({
      data: {
        employeeId,
        type: 'CONFIRMATION',
        status: 'PENDING_REVIEW',
        dueDate,
        sections: draftSections(confirmationSections(), employee),
        approvingOfficerId: await defaultSignatoryFor(employee.department),
      },
    })

    await storeLetterPdf(letter.id)

    await createAuditLog({
      userId: employeeId,
      action: 'CONFIRMATION_LETTER_GENERATED',
      entityType: 'EMPLOYMENT_LETTER',
      entityId: letter.id,
      details: { dueDate: dueDate.toISOString() },
    })
    revalidatePath('/letters')
  } catch (err) {
    console.error('generateConfirmationLetter error:', err)
  }
}

// ============================================================
// Editing the draft
// ============================================================

const MAX_SECTIONS = 40
const MAX_SECTION_BODY = 8000

/**
 * Replace a draft's sections with what HR has edited.
 *
 * Only while the letter is still awaiting review: once it has gone to the
 * signatory, changing the wording under them would mean they signed something
 * other than what was approved.
 */
export async function updateLetterSections(
  letterId: string,
  sections: { id?: string; title: string; body: string }[],
): Promise<LetterActionState> {
  try {
    const session = await verifySession()
    if (!isHr(session.role)) return { error: 'Permission denied.' }

    const letter = await db.employmentLetter.findUnique({ where: { id: letterId } })
    if (!letter) return { error: 'Letter not found.' }
    if (letter.status !== 'PENDING_REVIEW') {
      return { error: 'This letter has already gone for signature and can no longer be edited.' }
    }

    if (sections.length === 0) return { error: 'A letter needs at least one section.' }
    if (sections.length > MAX_SECTIONS) return { error: `A letter may have at most ${MAX_SECTIONS} sections.` }

    const cleaned: LetterSection[] = []
    for (const [index, section] of sections.entries()) {
      const title = section.title.trim()
      const body = section.body.trim()
      if (!title) return { error: `Section ${index + 1} needs a heading.` }
      if (!body) return { error: `Section “${title}” has no text.` }
      if (body.length > MAX_SECTION_BODY) {
        return { error: `Section “${title}” is too long.` }
      }
      cleaned.push({ id: section.id || `section-${index + 1}`, title, body })
    }

    await db.employmentLetter.update({
      where: { id: letterId },
      data: { sections: cleaned },
    })
    await storeLetterPdf(letterId)

    await createAuditLog({
      userId: session.userId,
      action: 'EMPLOYMENT_LETTER_GENERATED',
      entityType: 'EMPLOYMENT_LETTER',
      entityId: letterId,
      details: { edited: true, sectionCount: cleaned.length },
    })

    revalidatePath(`/letters/${letterId}`)
    return { success: true }
  } catch (err) {
    console.error('updateLetterSections error:', err)
    return { error: 'Failed to save the letter.' }
  }
}

/**
 * Re-draft a letter from a different kind's default terms. Discards edits, so
 * the workspace asks first.
 */
export async function changeLetterKind(
  letterId: string,
  kind: string,
): Promise<LetterActionState> {
  try {
    const session = await verifySession()
    if (!isHr(session.role)) return { error: 'Permission denied.' }
    if (!LETTER_KINDS.includes(kind as LetterKindName)) return { error: 'Unknown letter type.' }

    const letter = await db.employmentLetter.findUnique({
      where: { id: letterId },
      include: { employee: true },
    })
    if (!letter) return { error: 'Letter not found.' }
    if (letter.type !== 'EMPLOYMENT') return { error: 'Only employment letters have a type.' }
    if (letter.status !== 'PENDING_REVIEW') {
      return { error: 'This letter has already gone for signature.' }
    }

    await db.employmentLetter.update({
      where: { id: letterId },
      data: {
        kind: kind as LetterKindName,
        sections: draftSections(defaultSectionsFor(kind as LetterKindName), letter.employee),
      },
    })
    await storeLetterPdf(letterId)

    revalidatePath(`/letters/${letterId}`)
    return { success: true }
  } catch (err) {
    console.error('changeLetterKind error:', err)
    return { error: 'Failed to change the letter type.' }
  }
}

// ============================================================
// Review / approve / reject
// ============================================================

/**
 * HR approves a drafted letter and assigns the approving officer who will sign.
 * Moves the letter to PENDING_SIGNATURE.
 */
export async function approveLetterForSignature(
  letterId: string,
  approvingOfficerId: string,
): Promise<LetterActionState> {
  try {
    const session = await verifySession()
    if (!isHr(session.role)) return { error: 'Permission denied.' }
    if (!approvingOfficerId) return { error: 'Choose an approving officer.' }

    const letter = await db.employmentLetter.findUnique({
      where: { id: letterId },
      include: { employee: { select: { firstName: true, lastName: true } } },
    })
    if (!letter) return { error: 'Letter not found.' }
    if (letter.status !== 'PENDING_REVIEW') {
      return { error: 'This letter is no longer awaiting review.' }
    }

    const officer = await db.user.findUnique({
      where: { id: approvingOfficerId },
      select: { id: true, status: true },
    })
    if (!officer || officer.status !== 'ACTIVE') {
      return { error: 'That signatory is no longer active. Choose someone else.' }
    }

    await db.employmentLetter.update({
      where: { id: letterId },
      data: {
        status: 'PENDING_SIGNATURE',
        reviewedById: session.userId,
        reviewedAt: new Date(),
        approvingOfficerId,
      },
    })
    // Regenerated so the signatory's name is on the copy they are about to sign.
    await storeLetterPdf(letterId)

    await createAuditLog({
      userId: session.userId,
      action: 'LETTER_REVIEWED',
      entityType: 'EMPLOYMENT_LETTER',
      entityId: letterId,
      details: { approvingOfficerId },
    })
    await notify({
      userId: approvingOfficerId,
      type: 'LETTER_READY_FOR_ACTION',
      title: `A letter needs your signature`,
      body: `${letter.employee.firstName} ${letter.employee.lastName}'s ${
        letter.type === 'CONFIRMATION' ? 'confirmation' : 'employment'
      } letter has been reviewed by HR and is waiting for you to sign.`,
      linkUrl: `/letters/${letterId}`,
    })

    revalidatePath('/letters')
    revalidatePath(`/letters/${letterId}`)
    return { success: true }
  } catch (err) {
    console.error('approveLetterForSignature error:', err)
    return { error: 'Failed to approve letter.' }
  }
}

/** Reject a letter internally, at review or at signing. */
export async function rejectLetter(letterId: string, reason: string): Promise<LetterActionState> {
  try {
    const session = await verifySession()
    const letter = await db.employmentLetter.findUnique({
      where: { id: letterId },
      include: { employee: { select: { firstName: true, lastName: true } } },
    })
    if (!letter) return { error: 'Letter not found.' }
    const isOfficer = letter.approvingOfficerId === session.userId
    if (!isHr(session.role) && !isOfficer) return { error: 'Permission denied.' }

    await db.employmentLetter.update({
      where: { id: letterId },
      data: {
        status: 'REJECTED',
        rejectedById: session.userId,
        rejectedAt: new Date(),
        rejectionReason: reason || null,
      },
    })
    await createAuditLog({
      userId: session.userId,
      action: 'LETTER_REJECTED',
      entityType: 'EMPLOYMENT_LETTER',
      entityId: letterId,
      details: { reason },
    })
    await notifyHr({
      type: 'LETTER_DECLINED',
      title: `Letter rejected for ${letter.employee.firstName} ${letter.employee.lastName}`,
      body: reason ? `Reason given: ${reason}` : 'No reason was recorded.',
      linkUrl: `/letters/${letterId}`,
    })

    revalidatePath('/letters')
    revalidatePath(`/letters/${letterId}`)
    return { success: true }
  } catch (err) {
    console.error('rejectLetter error:', err)
    return { error: 'Failed to reject letter.' }
  }
}

// ============================================================
// Signing (the approving officer)
// ============================================================

/**
 * The approving officer signs with their drawn signature. The PDF is redrawn
 * with the signature on it, and the letter then goes to the employee.
 */
export async function signLetter(
  letterId: string,
  signatureDataUrl: string,
): Promise<LetterActionState> {
  try {
    const session = await verifySession()
    const letter = await db.employmentLetter.findUnique({
      where: { id: letterId },
      include: { employee: true },
    })
    if (!letter) return { error: 'Letter not found.' }

    const isOfficer = letter.approvingOfficerId === session.userId
    if (!isOfficer) {
      return { error: 'Only the assigned approving officer can sign this letter.' }
    }
    if (letter.status !== 'PENDING_SIGNATURE') {
      return { error: 'This letter is not awaiting a signature.' }
    }
    if (!signatureDataUrl?.startsWith('data:image')) {
      return { error: 'A signature is required.' }
    }

    await db.employmentLetter.update({
      where: { id: letterId },
      data: { status: 'SIGNED', signedAt: new Date(), signatureDataUrl },
    })
    await storeLetterPdf(letterId)

    await createAuditLog({
      userId: session.userId,
      action: 'LETTER_SIGNED',
      entityType: 'EMPLOYMENT_LETTER',
      entityId: letterId,
    })

    // Employment letters go straight to the new hire. Confirmation letters wait
    // for their due date, which the daily cron watches.
    if (letter.type === 'EMPLOYMENT' || (letter.dueDate && letter.dueDate <= new Date())) {
      await sendLetterToEmployee(letterId)
    }

    revalidatePath('/letters')
    revalidatePath(`/letters/${letterId}`)
    return { success: true }
  } catch (err) {
    console.error('signLetter error:', err)
    return { error: 'Failed to sign letter.' }
  }
}

// ============================================================
// Delivery to the employee
// ============================================================

/**
 * Send a signed letter to the employee and put it in front of them in the app.
 * Used by `signLetter` and the daily cron. Idempotent.
 */
export async function sendLetterToEmployee(letterId: string): Promise<LetterActionState> {
  try {
    const letter = await db.employmentLetter.findUnique({
      where: { id: letterId },
      include: { employee: true },
    })
    if (!letter) return { error: 'Letter not found.' }
    if (letter.sentAt) return { success: true }
    if (letter.status !== 'SIGNED') return { error: 'Letter is not signed yet.' }

    let attachment: { fileName: string; buffer: Buffer } | undefined
    if (letter.blobId) {
      const file = await storage.get(letter.blobId)
      if (file) {
        attachment = {
          fileName: `${letter.type === 'EMPLOYMENT' ? 'Employment' : 'Confirmation'} Letter.pdf`,
          buffer: file.data,
        }
      } else {
        console.error(`[letters] letter ${letter.id} references a missing blob`)
      }
    }

    const label = letter.type === 'EMPLOYMENT' ? 'employment letter' : 'confirmation letter'
    const result = await deliverLetter({
      to: {
        email: letter.employee.email,
        name: `${letter.employee.firstName} ${letter.employee.lastName}`,
      },
      subject: `Your ${label} from ${letter.employee.company ?? 'IORA Group'}`,
      bodyHtml:
        `<p>Dear ${letter.employee.firstName},</p>` +
        `<p>Please find your ${label} attached. Sign in to review and sign it.</p>`,
      attachment,
    })

    await db.employmentLetter.update({
      where: { id: letterId },
      data: { status: 'SENT', sentAt: new Date(), overdue: false },
    })
    await createAuditLog({
      userId: letter.employeeId,
      action: 'LETTER_SENT',
      entityType: 'EMPLOYMENT_LETTER',
      entityId: letterId,
      details: { channel: result.channel },
    })
    await notify({
      userId: letter.employeeId,
      type: 'LETTER_SENT',
      title: `Your ${label} is ready to sign`,
      body: 'Read it through and either sign it or let HR know why you cannot.',
      linkUrl: `/my-letters/${letterId}`,
    })

    revalidatePath('/letters')
    return { success: true }
  } catch (err) {
    console.error('sendLetterToEmployee error:', err)
    return { error: 'Failed to send letter.' }
  }
}

// ============================================================
// The employee's response
// ============================================================

/**
 * The employee countersigns. Both signatures go on the final PDF, that PDF is
 * filed in their own document folder, and the onboarding document request
 * (form 2) opens.
 */
export async function acceptLetter(
  letterId: string,
  signatureDataUrl: string,
): Promise<LetterActionState> {
  try {
    const session = await verifySession()
    const letter = await db.employmentLetter.findUnique({
      where: { id: letterId },
      include: { employee: true },
    })
    if (!letter) return { error: 'Letter not found.' }
    if (letter.employeeId !== session.userId) {
      return { error: 'Only the employee named on a letter can sign it.' }
    }
    if (letter.status !== 'SENT') {
      return { error: 'This letter is not waiting for your signature.' }
    }
    if (!signatureDataUrl?.startsWith('data:image')) {
      return { error: 'Please draw your signature before signing.' }
    }

    await db.employmentLetter.update({
      where: { id: letterId },
      data: {
        status: 'ACCEPTED',
        employeeSignatureDataUrl: signatureDataUrl,
        employeeAcceptedAt: new Date(),
      },
    })
    const blobId = await storeLetterPdf(letterId)

    // File the countersigned copy in the employee's own folder. `storeLetterPdf`
    // already holds one reference for the letter record, so this takes a second.
    if (blobId) {
      const file = await storage.get(blobId)
      const name = `${letter.type === 'EMPLOYMENT' ? 'Employment' : 'Confirmation'} letter (signed)`
      const alreadyFiled = await db.document.findFirst({
        where: { employeeId: letter.employeeId, blobId },
        select: { id: true },
      })
      if (file && !alreadyFiled) {
        await storage.addRef(blobId)
        await db.document.create({
          data: {
            name,
            scope: 'EMPLOYEE',
            category: 'CONTRACTS',
            employeeId: letter.employeeId,
            blobId,
            fileName: `${name}.pdf`,
            fileSize: file.fileSize,
            mimeType: 'application/pdf',
            uploadedById: letter.employeeId,
          },
        })
      }
    }

    // Open the document request that follows acceptance. Created empty so
    // "who still owes us their documents" is a query rather than a spreadsheet.
    await db.onboardingSubmission.upsert({
      where: { userId: letter.employeeId },
      create: { userId: letter.employeeId },
      update: {},
    })

    await createAuditLog({
      userId: session.userId,
      action: 'LETTER_ACCEPTED',
      entityType: 'EMPLOYMENT_LETTER',
      entityId: letterId,
    })

    const who = `${letter.employee.firstName} ${letter.employee.lastName}`
    await notifyHr({
      type: 'LETTER_ACCEPTED',
      title: `${who} signed their letter`,
      body: 'The countersigned copy is filed in their documents. Their onboarding documents are now outstanding.',
      linkUrl: `/letters/${letterId}`,
    })
    if (letter.approvingOfficerId) {
      await notify({
        userId: letter.approvingOfficerId,
        type: 'LETTER_ACCEPTED',
        title: `${who} signed the letter you approved`,
        body: 'No further action is needed from you.',
        linkUrl: `/letters/${letterId}`,
      })
    }
    await notify({
      userId: letter.employeeId,
      type: 'ONBOARDING_DOCS_DUE',
      title: 'Send us your onboarding documents',
      body: 'We need your NRIC, bank details and (for PRs) your entry permit before you can be added to payroll.',
      linkUrl: '/onboarding',
    })

    revalidatePath('/letters')
    revalidatePath('/my-letters')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('acceptLetter error:', err)
    return { error: 'Failed to sign the letter.' }
  }
}

/** The employee turns the offer down. */
export async function declineLetter(letterId: string, reason: string): Promise<LetterActionState> {
  try {
    const session = await verifySession()
    const letter = await db.employmentLetter.findUnique({
      where: { id: letterId },
      include: { employee: { select: { firstName: true, lastName: true } } },
    })
    if (!letter) return { error: 'Letter not found.' }
    if (letter.employeeId !== session.userId) {
      return { error: 'Only the employee named on a letter can respond to it.' }
    }
    if (letter.status !== 'SENT') {
      return { error: 'This letter is not waiting for your response.' }
    }

    await db.employmentLetter.update({
      where: { id: letterId },
      data: {
        status: 'DECLINED',
        employeeDeclinedAt: new Date(),
        employeeDeclineReason: reason?.trim() || null,
      },
    })
    await createAuditLog({
      userId: session.userId,
      action: 'LETTER_DECLINED',
      entityType: 'EMPLOYMENT_LETTER',
      entityId: letterId,
      details: { reason },
    })

    const who = `${letter.employee.firstName} ${letter.employee.lastName}`
    await notifyHr({
      type: 'LETTER_DECLINED',
      title: `${who} declined their letter`,
      body: reason?.trim() ? `Reason given: ${reason.trim()}` : 'No reason was given.',
      linkUrl: `/letters/${letterId}`,
    })
    if (letter.approvingOfficerId) {
      await notify({
        userId: letter.approvingOfficerId,
        type: 'LETTER_DECLINED',
        title: `${who} declined the letter you signed`,
        body: reason?.trim() ? `Reason given: ${reason.trim()}` : 'No reason was given.',
        linkUrl: `/letters/${letterId}`,
      })
    }

    revalidatePath('/letters')
    revalidatePath('/my-letters')
    return { success: true }
  } catch (err) {
    console.error('declineLetter error:', err)
    return { error: 'Failed to record your response.' }
  }
}

// ============================================================
// Queries
// ============================================================

/** The HR queue: everything not yet settled, plus recently settled letters. */
export async function getLettersToReview() {
  await requireCapability('letters.read')
  return db.employmentLetter.findMany({
    where: {
      status: { in: ['PENDING_REVIEW', 'PENDING_SIGNATURE', 'SIGNED', 'SENT', 'OVERDUE', 'DECLINED'] },
    },
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true, position: true, department: true },
      },
      approvingOfficer: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  })
}

/** Letters waiting on the signed-in user's signature as approving officer. */
export async function getLettersAwaitingMySignature(userId: string) {
  return db.employmentLetter.findMany({
    where: { approvingOfficerId: userId, status: 'PENDING_SIGNATURE' },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, position: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}

/** Every letter belonging to the signed-in user. */
export async function getMyLetters() {
  const session = await verifySession()
  return db.employmentLetter.findMany({
    where: { employeeId: session.userId, status: { notIn: ['PENDING_REVIEW', 'REJECTED'] } },
    select: {
      id: true,
      type: true,
      kind: true,
      status: true,
      blobId: true,
      sentAt: true,
      signedAt: true,
      employeeAcceptedAt: true,
      employeeDeclinedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * A single letter, for the HR workspace, the signatory, and the employee
 * reading their own.
 *
 * Two things were wrong here once: no authorization beyond "has a session", so
 * any role could read any employee's letter by walking ids; and `employee: true`
 * handed the whole User row — `passwordHash` and `nric` included — to a client
 * component. Both are fixed below.
 */
export async function getLetterDetail(letterId: string) {
  const session = await verifySession()

  const letter = await db.employmentLetter.findUnique({
    where: { id: letterId },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          position: true,
          department: true,
          company: true,
          country: true,
          employeeNumber: true,
          startDate: true,
          probationEndDate: true,
          confirmationDate: true,
        },
      },
      approvingOfficer: { select: { id: true, firstName: true, lastName: true, position: true } },
      reviewedBy: { select: { firstName: true, lastName: true } },
      rejectedBy: { select: { firstName: true, lastName: true } },
    },
  })

  if (!letter) return null

  const isOwnLetter = letter.employeeId === session.userId
  const isSignatory = letter.approvingOfficerId === session.userId
  if (!isOwnLetter && !isSignatory && !can(session.role, 'letters.read')) {
    throw new Error('You do not have permission to view this letter')
  }

  return letter
}

/** Who HR can nominate as a signatory. */
export async function getActiveOfficers() {
  await requireCapability('letters.write')
  return db.user.findMany({
    where: { status: 'ACTIVE', role: { in: ['HR', 'MANAGER'] } },
    select: { id: true, firstName: true, lastName: true, position: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })
}

/** Letter types HR can pick from, for the workspace dropdown. */
export async function getLetterKindOptions(): Promise<{ value: string; label: string }[]> {
  return LETTER_KINDS.map(k => ({ value: k, label: LETTER_KIND_LABELS[k] }))
}

