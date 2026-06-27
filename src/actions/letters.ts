'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { verifySession, requireRole } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import {
  isDriveConfigured,
  getEmployeeFolderName,
  getLetterFolderPath,
  downloadFile,
  deleteFile,
} from '@/lib/google-drive'
import {
  generateLetterPdfToDrive,
  stampSignatureOnDrivePdf,
  getLetterTemplateId,
} from '@/lib/google-docs'
import { deliverLetter } from '@/lib/notifications'
import type { User, LetterType } from '@/generated/prisma/client'

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

function isHr(role: string): boolean {
  return role === 'ADMIN' || role === 'HR'
}

/** Merge fields available to letter templates as {{placeholder}}. */
function buildReplacements(employee: User, officerName?: string): Record<string, string> {
  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    fullName: `${employee.firstName} ${employee.lastName}`,
    employeeNumber: employee.employeeNumber ?? '',
    nric: employee.nric ?? '',
    passportNumber: employee.passportNumber ?? '',
    position: employee.position ?? '',
    department: employee.department ?? '',
    company: employee.company ?? '',
    country: employee.country,
    email: employee.email,
    startDate: fmtDate(employee.startDate),
    probationEndDate: fmtDate(employee.probationEndDate),
    confirmationDate: fmtDate(employee.confirmationDate),
    today: fmtDate(new Date()),
    approvingOfficerName: officerName ?? '',
  }
}

/**
 * Generate the letter PDF and store it in the employee's Drive folder.
 * Returns null when Drive/Docs isn't configured or the template id is missing
 * (so the flow still works on local dev — the record is created without a PDF).
 */
async function generateAndStorePdf(
  employee: User,
  type: LetterType,
  officerName?: string,
): Promise<{ fileId: string; webViewLink: string } | null> {
  if (!isDriveConfigured()) return null
  const templateDocId = getLetterTemplateId(type)
  if (!templateDocId) return null

  const folderName = getEmployeeFolderName(employee)
  const folderPath = getLetterFolderPath(folderName)
  const label = type === 'EMPLOYMENT' ? 'Employment Letter' : 'Confirmation Letter'
  const fileName = `${label} - ${employee.firstName} ${employee.lastName} - ${fmtDate(new Date())}.pdf`
  const replacements = buildReplacements(employee, officerName)

  return generateLetterPdfToDrive({ templateDocId, replacements, fileName, folderPath })
}

// ============================================================
// Generation (called by users.ts on hire / when confirmation date set)
// ============================================================

/**
 * Auto-draft the employment letter for a freshly created employee.
 * Never throws — letter generation failures must not block employee creation.
 */
export async function generateEmploymentLetter(employeeId: string): Promise<void> {
  try {
    const employee = await db.user.findUnique({ where: { id: employeeId } })
    if (!employee) return
    const existing = await db.employmentLetter.findFirst({
      where: { employeeId, type: 'EMPLOYMENT' },
    })
    if (existing) return // don't duplicate

    let pdf: { fileId: string; webViewLink: string } | null = null
    try {
      pdf = await generateAndStorePdf(employee, 'EMPLOYMENT')
    } catch (err) {
      console.error('generateEmploymentLetter PDF error:', err)
    }

    const letter = await db.employmentLetter.create({
      data: {
        employeeId,
        type: 'EMPLOYMENT',
        status: 'PENDING_REVIEW',
        driveFileId: pdf?.fileId ?? null,
        driveWebViewLink: pdf?.webViewLink ?? null,
      },
    })
    await createAuditLog({
      userId: employeeId,
      action: 'EMPLOYMENT_LETTER_GENERATED',
      entityType: 'EMPLOYMENT_LETTER',
      entityId: letter.id,
      details: { hadPdf: Boolean(pdf) },
    })
    revalidatePath('/admin/letters')
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
      where: { employeeId, type: 'CONFIRMATION', status: { notIn: ['REJECTED'] } },
    })

    if (existing) {
      // Already exists — just keep the due date in sync, reset overdue.
      await db.employmentLetter.update({
        where: { id: existing.id },
        data: { dueDate, overdue: false, status: existing.status === 'OVERDUE' ? 'PENDING_SIGNATURE' : existing.status },
      })
      return
    }

    let pdf: { fileId: string; webViewLink: string } | null = null
    try {
      pdf = await generateAndStorePdf(employee, 'CONFIRMATION')
    } catch (err) {
      console.error('generateConfirmationLetter PDF error:', err)
    }

    const letter = await db.employmentLetter.create({
      data: {
        employeeId,
        type: 'CONFIRMATION',
        status: 'PENDING_REVIEW',
        dueDate,
        driveFileId: pdf?.fileId ?? null,
        driveWebViewLink: pdf?.webViewLink ?? null,
      },
    })
    await createAuditLog({
      userId: employeeId,
      action: 'CONFIRMATION_LETTER_GENERATED',
      entityType: 'EMPLOYMENT_LETTER',
      entityId: letter.id,
      details: { dueDate: dueDate.toISOString() },
    })
    revalidatePath('/admin/letters')
  } catch (err) {
    console.error('generateConfirmationLetter error:', err)
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

    const letter = await db.employmentLetter.findUnique({ where: { id: letterId } })
    if (!letter) return { error: 'Letter not found.' }
    if (letter.status !== 'PENDING_REVIEW') {
      return { error: 'This letter is no longer awaiting review.' }
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
    await createAuditLog({
      userId: session.userId,
      action: 'LETTER_REVIEWED',
      entityType: 'EMPLOYMENT_LETTER',
      entityId: letterId,
      details: { approvingOfficerId },
    })
    revalidatePath('/admin/letters')
    revalidatePath(`/admin/letters/${letterId}`)
    return { success: true }
  } catch (err) {
    console.error('approveLetterForSignature error:', err)
    return { error: 'Failed to approve letter.' }
  }
}

/** Reject a letter at review or signing. */
export async function rejectLetter(letterId: string, reason: string): Promise<LetterActionState> {
  try {
    const session = await verifySession()
    const letter = await db.employmentLetter.findUnique({ where: { id: letterId } })
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
    revalidatePath('/admin/letters')
    revalidatePath(`/admin/letters/${letterId}`)
    return { success: true }
  } catch (err) {
    console.error('rejectLetter error:', err)
    return { error: 'Failed to reject letter.' }
  }
}

// ============================================================
// Signing
// ============================================================

/**
 * The approving officer signs the letter with their drawn signature.
 * Regenerates the PDF with the officer's name merged in, stamps the signature,
 * stores the final PDF, and (for due confirmation letters) delivers it.
 */
export async function signLetter(
  letterId: string,
  signatureDataUrl: string,
): Promise<LetterActionState> {
  try {
    const session = await verifySession()
    const letter = await db.employmentLetter.findUnique({
      where: { id: letterId },
      include: { employee: true, approvingOfficer: true },
    })
    if (!letter) return { error: 'Letter not found.' }

    const isOfficer = letter.approvingOfficerId === session.userId
    if (!isOfficer && session.role !== 'ADMIN') {
      return { error: 'Only the assigned approving officer can sign this letter.' }
    }
    if (letter.status !== 'PENDING_SIGNATURE') {
      return { error: 'This letter is not awaiting a signature.' }
    }
    if (!signatureDataUrl?.startsWith('data:image')) {
      return { error: 'A signature is required.' }
    }

    const signer = await db.user.findUnique({ where: { id: session.userId } })
    const officerName = signer ? `${signer.firstName} ${signer.lastName}` : undefined

    // Regenerate with officer name, stamp signature, store final PDF.
    let finalPdf: { fileId: string; webViewLink: string } | null = null
    try {
      const fresh = await generateAndStorePdf(letter.employee, letter.type, officerName)
      if (fresh) {
        finalPdf = await stampSignatureOnDrivePdf({
          fileId: fresh.fileId,
          signatureDataUrl,
        })
        // Remove the old draft file if it was a different file.
        if (letter.driveFileId && letter.driveFileId !== fresh.fileId) {
          await deleteFile(letter.driveFileId).catch(() => {})
        }
      }
    } catch (err) {
      console.error('signLetter PDF error:', err)
    }

    await db.employmentLetter.update({
      where: { id: letterId },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        signatureDataUrl,
        driveFileId: finalPdf?.fileId ?? letter.driveFileId,
        driveWebViewLink: finalPdf?.webViewLink ?? letter.driveWebViewLink,
      },
    })
    await createAuditLog({
      userId: session.userId,
      action: 'LETTER_SIGNED',
      entityType: 'EMPLOYMENT_LETTER',
      entityId: letterId,
    })

    // Confirmation letters that are already due go out immediately once signed.
    if (letter.type === 'CONFIRMATION' && letter.dueDate && letter.dueDate <= new Date()) {
      await sendLetterToEmployee(letterId)
    }

    revalidatePath('/admin/letters')
    revalidatePath(`/admin/letters/${letterId}`)
    return { success: true }
  } catch (err) {
    console.error('signLetter error:', err)
    return { error: 'Failed to sign letter.' }
  }
}

// ============================================================
// Delivery (confirmation letters → employee, via Lark/email)
// ============================================================

/**
 * Deliver a signed letter to the employee. Used by signLetter (when already
 * due) and the daily cron. Idempotent: no-op if already sent.
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
    if (letter.driveFileId && isDriveConfigured()) {
      try {
        const buffer = await downloadFile(letter.driveFileId)
        attachment = {
          fileName: `${letter.type === 'EMPLOYMENT' ? 'Employment' : 'Confirmation'} Letter.pdf`,
          buffer,
        }
      } catch (err) {
        console.error('sendLetterToEmployee download error:', err)
      }
    }

    const label = letter.type === 'EMPLOYMENT' ? 'employment letter' : 'confirmation letter'
    const result = await deliverLetter({
      to: { email: letter.employee.email, name: `${letter.employee.firstName} ${letter.employee.lastName}` },
      subject: `Your ${label} from ${letter.employee.company ?? 'the company'}`,
      bodyHtml: `<p>Dear ${letter.employee.firstName},</p><p>Please find your signed ${label} attached.</p>`,
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
    revalidatePath('/admin/letters')
    return { success: true }
  } catch (err) {
    console.error('sendLetterToEmployee error:', err)
    return { error: 'Failed to send letter.' }
  }
}

// ============================================================
// Queries (HR queue + detail + officer list)
// ============================================================

export async function getLettersToReview() {
  await requireRole(['ADMIN', 'HR'])
  return db.employmentLetter.findMany({
    where: { status: { in: ['PENDING_REVIEW', 'PENDING_SIGNATURE', 'SIGNED', 'OVERDUE'] } },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, position: true, department: true } },
      approvingOfficer: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function getLetterDetail(letterId: string) {
  await verifySession()
  return db.employmentLetter.findUnique({
    where: { id: letterId },
    include: {
      employee: true,
      approvingOfficer: { select: { id: true, firstName: true, lastName: true } },
      reviewedBy: { select: { firstName: true, lastName: true } },
    },
  })
}

export async function getActiveOfficers() {
  await requireRole(['ADMIN', 'HR'])
  return db.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, position: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })
}
