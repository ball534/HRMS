import 'server-only'

import { db } from '@/lib/db'
import { can } from '@/lib/permissions'
import type { VerifiedSession } from '@/lib/dal'

/**
 * Who may read a stored file.
 *
 * The old download route was an authenticated open door: `/api/files/[fileId]`
 * checked that you had a session and then streamed **any** Drive file id it was
 * given — payslips, medical certificates, other people's signed letters —
 * without ever asking whether the caller should see that particular document.
 * Worse, the Drive identity it impersonated fell back to a hardcoded personal
 * account on an external domain, so the blast radius was the whole Drive rather
 * than just this app's files.
 *
 * Access is now resolved from what the blob *is*. A blob is reachable through
 * exactly the records that reference it, so we look those up and apply each
 * one's own rule. If any referencing record grants access, the read is allowed.
 *
 * The rules:
 *
 *   Document      the employee it belongs to, or `documents.admin`.
 *                 MEDICAL is `documents.admin` only — an employee's own medical
 *                 records are readable by them, but a manager never sees them.
 *   Company doc   any authenticated employee (that is what COMPANY scope means).
 *   Receipt       the claimant, the claim's assigned approver, or `expense.admin`.
 *   Letter        the employee it is addressed to, its approving officer, or
 *                 `letters.read`.
 *   Template      `letters.write` — blank stationery, but not public.
 *
 * Anything else is refused. A blob with no references at all is treated as gone
 * rather than as unowned-and-therefore-free.
 */

export type FileAccessDecision =
  | {
      allowed: true
      /** What the file turned out to be — recorded in the audit row. */
      kind: 'document' | 'company_document' | 'receipt' | 'letter' | 'letter_template'
      /** Whose record it is, where there is one. */
      subjectUserId: string | null
      /** Human-facing filename for Content-Disposition. */
      fileName: string
      /** Set for documents; drives the MEDICAL restriction and the audit row. */
      category?: string
      /** Id of the referencing record, for the audit row. */
      recordId: string
    }
  | { allowed: false; reason: 'not_found' | 'forbidden' }

export async function resolveFileAccess(
  blobId: string,
  session: VerifiedSession,
): Promise<FileAccessDecision> {
  // A blob is only reachable through the records that point at it.
  const [documents, receipts, letters, templates] = await Promise.all([
    db.document.findMany({
      where: { blobId },
      select: { id: true, employeeId: true, scope: true, category: true, fileName: true, name: true },
    }),
    db.expenseReceipt.findMany({
      where: { blobId },
      select: {
        id: true,
        fileName: true,
        expense: { select: { id: true, userId: true, approverId: true } },
      },
    }),
    db.employmentLetter.findMany({
      where: { blobId },
      select: { id: true, employeeId: true, type: true, approvingOfficerId: true },
    }),
    db.letterTemplate.findMany({
      where: { blobId },
      select: { id: true, type: true, fileName: true },
    }),
  ])

  const referenced =
    documents.length > 0 || receipts.length > 0 || letters.length > 0 || templates.length > 0
  if (!referenced) {
    return { allowed: false, reason: 'not_found' }
  }

  // --- Documents ---
  for (const doc of documents) {
    const isHrDocs = can(session.role, 'documents.admin')

    if (doc.scope === 'COMPANY') {
      // Company-wide documents (handbooks, policies) are for everyone.
      return {
        allowed: true,
        kind: 'company_document',
        subjectUserId: null,
        fileName: doc.fileName,
        category: doc.category,
        recordId: doc.id,
      }
    }

    // Medical records are HR-only, even though the employee's other documents
    // are readable by them. An employee can still see their own.
    const isOwn = doc.employeeId === session.userId
    if (doc.category === 'MEDICAL' && !isOwn && !isHrDocs) continue

    if (isOwn || isHrDocs) {
      return {
        allowed: true,
        kind: 'document',
        subjectUserId: doc.employeeId,
        fileName: doc.fileName,
        category: doc.category,
        recordId: doc.id,
      }
    }
  }

  // --- Expense receipts ---
  for (const receipt of receipts) {
    const isClaimant = receipt.expense.userId === session.userId
    const isApprover = receipt.expense.approverId === session.userId
    if (isClaimant || isApprover || can(session.role, 'expense.admin')) {
      return {
        allowed: true,
        kind: 'receipt',
        subjectUserId: receipt.expense.userId,
        fileName: receipt.fileName,
        recordId: receipt.id,
      }
    }
  }

  // --- Employment / confirmation letters ---
  for (const letter of letters) {
    const isSubject = letter.employeeId === session.userId
    const isOfficer = letter.approvingOfficerId === session.userId
    if (isSubject || isOfficer || can(session.role, 'letters.read')) {
      return {
        allowed: true,
        kind: 'letter',
        subjectUserId: letter.employeeId,
        fileName: `${letter.type === 'EMPLOYMENT' ? 'Employment' : 'Confirmation'} Letter.pdf`,
        recordId: letter.id,
      }
    }
  }

  // --- Letter templates ---
  for (const template of templates) {
    if (can(session.role, 'letters.write')) {
      return {
        allowed: true,
        kind: 'letter_template',
        subjectUserId: null,
        fileName: template.fileName,
        recordId: template.id,
      }
    }
  }

  return { allowed: false, reason: 'forbidden' }
}
