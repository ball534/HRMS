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
 *   Letter        the employee it is addressed to, its approving officer, or
 *                 `letters.read`.
 *   Work pass     the employee the pass belongs to, or `workpass.read`. HR
 *                 uploads these; the employee only ever reads their own.
 *   Résumé        `candidates.read` — a candidate has no login to grant.
 *
 * Anything else is refused. A blob with no references at all is treated as gone
 * rather than as unowned-and-therefore-free.
 */

export type FileAccessDecision =
  | {
      allowed: true
      /** What the file turned out to be — recorded in the audit row. */
      kind:
        | 'document'
        | 'company_document'
        | 'letter'
        | 'work_pass_document'
        | 'candidate_resume'
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
  // A blob is only reachable through the records that point at it, so we look
  // those up and apply each one's own rule.
  //
  // Queried in sequence rather than all at once, most-likely first: the great
  // majority of files are documents, so the common case costs one indexed
  // lookup instead of several. Every one of these columns is indexed — before
  // that, each download did a sequential scan per table.
  const documents = await db.document.findMany({
    where: { blobId },
    select: { id: true, employeeId: true, scope: true, category: true, fileName: true },
  })

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

  // --- Employment / confirmation letters ---
  const letters = await db.employmentLetter.findMany({
    where: { blobId },
    select: { id: true, employeeId: true, type: true, approvingOfficerId: true },
  })
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

  // --- Work-pass attachments ---
  const passDocs = await db.workPassDocument.findMany({
    where: { blobId },
    select: { id: true, fileName: true, workPass: { select: { userId: true } } },
  })
  for (const passDoc of passDocs) {
    const isSubject = passDoc.workPass.userId === session.userId
    if (isSubject || can(session.role, 'workpass.read')) {
      return {
        allowed: true,
        kind: 'work_pass_document',
        subjectUserId: passDoc.workPass.userId,
        fileName: passDoc.fileName,
        recordId: passDoc.id,
      }
    }
  }

  // --- Candidate résumés ---
  const resumes = await db.candidate.findMany({
    where: { resumeBlobId: blobId },
    select: { id: true, resumeFileName: true, firstName: true, lastName: true },
  })
  for (const resume of resumes) {
    if (can(session.role, 'candidates.read')) {
      return {
        allowed: true,
        kind: 'candidate_resume',
        // A candidate is not a user, so there is no subject id to record.
        subjectUserId: null,
        fileName: resume.resumeFileName ?? `${resume.firstName} ${resume.lastName} resume`,
        recordId: resume.id,
      }
    }
  }

  // Nothing references this blob at all — treat it as gone rather than as
  // unowned-and-therefore-free.
  const referenced =
    documents.length > 0 || letters.length > 0 || passDocs.length > 0 || resumes.length > 0
  return { allowed: false, reason: referenced ? 'forbidden' : 'not_found' }
}
