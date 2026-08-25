'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { verifySession, requireCapability } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import { putChecked, FileTooLargeError } from '@/lib/storage'
import { notifyHr } from '@/lib/notify'

/**
 * Onboarding form 2 — the documents collected after a new hire signs their
 * letter.
 *
 * Design notes worth keeping:
 *
 *   - The row is created empty when the letter is accepted (see
 *     `acceptLetter`), so "who still owes us their documents" is a query rather
 *     than something HR tracks in a spreadsheet.
 *   - The uploads become ordinary `Document` rows against the employee. That
 *     means the existing file-access rules already restrict them to the
 *     employee and HR, and the existing download route already audits every
 *     read, rather than this feature inventing a second way to hold files.
 *   - The bank account number is stored because payroll needs it, is never
 *     written into an audit log or a notification, and is only ever returned to
 *     the employee themselves or to HR.
 */

export type OnboardingActionState = {
  success?: boolean
  error?: string
  errors?: Record<string, string[]>
}

const ACCEPTED_IMAGE = ['image/png', 'image/jpeg', 'image/webp']
const ACCEPTED_PDF = ['application/pdf']

const SubmitSchema = z.object({
  bankName: z.string().min(2, 'Which bank is it?').max(80),
  bankAccountName: z.string().min(2, 'Name on the account is required').max(120),
  bankAccountNumber: z
    .string()
    .min(5, 'Account number looks too short')
    .max(40)
    .regex(/^[0-9\s-]+$/, 'Account number should be digits only'),
  prGrantDate: z.string().optional(),
})

/**
 * Store one uploaded file as a Document against the employee.
 * Returns the Document id, or an error message the form can show.
 */
async function fileToDocument(opts: {
  file: unknown
  employeeId: string
  name: string
  accepted: string[]
  acceptedLabel: string
}): Promise<{ id: string } | { error: string }> {
  const { file } = opts
  if (!(file instanceof File) || file.size === 0) {
    return { error: `${opts.name} is required.` }
  }
  if (!opts.accepted.includes(file.type)) {
    return { error: `${opts.name} must be ${opts.acceptedLabel}.` }
  }

  try {
    const stored = await putChecked(Buffer.from(await file.arrayBuffer()), file.type)
    const doc = await db.document.create({
      data: {
        name: opts.name,
        scope: 'EMPLOYEE',
        category: 'PERSONAL_DOCS',
        employeeId: opts.employeeId,
        blobId: stored.blobId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        // The employee uploads their own documents, so they are the uploader.
        uploadedById: opts.employeeId,
      },
      select: { id: true },
    })
    return { id: doc.id }
  } catch (err) {
    if (err instanceof FileTooLargeError) return { error: err.message }
    throw err
  }
}

/**
 * The employee submits their onboarding documents.
 *
 * Everything is validated before anything is stored, so a rejected submission
 * doesn't leave half the files behind. Re-submitting replaces the previous
 * documents rather than adding a second set.
 */
export async function submitOnboarding(
  _state: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  try {
    const session = await verifySession()
    const me = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, citizenship: true },
    })
    if (!me) return { error: 'Your account could not be loaded.' }

    const parsed = SubmitSchema.safeParse({
      bankName: formData.get('bankName'),
      bankAccountName: formData.get('bankAccountName'),
      bankAccountNumber: formData.get('bankAccountNumber'),
      prGrantDate: formData.get('prGrantDate') || undefined,
    })
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors }
    }
    const data = parsed.data

    const isPr = me.citizenship === 'SG_PR'
    if (isPr && !data.prGrantDate) {
      return { errors: { prGrantDate: ['Tell us when you were granted PR.'] } }
    }

    // --- Validate the files before writing any of them ---
    const uploads: Record<string, unknown> = {
      nricFront: formData.get('nricFront'),
      nricBack: formData.get('nricBack'),
      bankProof: formData.get('bankProof'),
      entryPermit: formData.get('entryPermit'),
    }

    const fieldErrors: Record<string, string[]> = {}
    function requireFile(key: string, label: string, accepted: string[], acceptedLabel: string) {
      const f = uploads[key]
      if (!(f instanceof File) || f.size === 0) {
        fieldErrors[key] = [`${label} is required.`]
        return
      }
      if (!accepted.includes(f.type)) {
        fieldErrors[key] = [`${label} must be ${acceptedLabel}.`]
      }
    }

    requireFile('nricFront', 'The front of your NRIC', ACCEPTED_IMAGE, 'a PNG, JPEG or WebP image')
    requireFile('nricBack', 'The back of your NRIC', ACCEPTED_IMAGE, 'a PNG, JPEG or WebP image')
    requireFile(
      'bankProof',
      'Proof of your bank account',
      [...ACCEPTED_IMAGE, ...ACCEPTED_PDF],
      'an image or a PDF',
    )
    if (isPr) {
      requireFile('entryPermit', 'Your entry permit', ACCEPTED_PDF, 'a PDF')
    }

    if (Object.keys(fieldErrors).length > 0) {
      return { errors: fieldErrors }
    }

    // --- Store ---
    const nricFront = await fileToDocument({
      file: uploads.nricFront,
      employeeId: me.id,
      name: 'NRIC (front)',
      accepted: ACCEPTED_IMAGE,
      acceptedLabel: 'an image',
    })
    if ('error' in nricFront) return { errors: { nricFront: [nricFront.error] } }

    const nricBack = await fileToDocument({
      file: uploads.nricBack,
      employeeId: me.id,
      name: 'NRIC (back)',
      accepted: ACCEPTED_IMAGE,
      acceptedLabel: 'an image',
    })
    if ('error' in nricBack) return { errors: { nricBack: [nricBack.error] } }

    const bankProof = await fileToDocument({
      file: uploads.bankProof,
      employeeId: me.id,
      name: 'Bank account details',
      accepted: [...ACCEPTED_IMAGE, ...ACCEPTED_PDF],
      acceptedLabel: 'an image or PDF',
    })
    if ('error' in bankProof) return { errors: { bankProof: [bankProof.error] } }

    let entryPermitId: string | null = null
    if (isPr) {
      const permit = await fileToDocument({
        file: uploads.entryPermit,
        employeeId: me.id,
        name: 'Entry permit',
        accepted: ACCEPTED_PDF,
        acceptedLabel: 'a PDF',
      })
      if ('error' in permit) return { errors: { entryPermit: [permit.error] } }
      entryPermitId = permit.id
    }

    const submission = {
      bankName: data.bankName.trim(),
      bankAccountName: data.bankAccountName.trim(),
      bankAccountNumber: data.bankAccountNumber.replace(/[\s-]/g, ''),
      prGrantDate: isPr && data.prGrantDate ? new Date(data.prGrantDate) : null,
      nricFrontDocId: nricFront.id,
      nricBackDocId: nricBack.id,
      bankProofDocId: bankProof.id,
      entryPermitDocId: entryPermitId,
      submittedAt: new Date(),
    }

    await db.onboardingSubmission.upsert({
      where: { userId: me.id },
      create: { userId: me.id, ...submission },
      update: submission,
    })

    // Deliberately records only that documents arrived — never the bank details
    // themselves, which would duplicate them into a second table.
    await createAuditLog({
      userId: me.id,
      action: 'ONBOARDING_SUBMITTED',
      entityType: 'ONBOARDING',
      entityId: me.id,
      details: { includedEntryPermit: Boolean(entryPermitId) },
    })
    await notifyHr({
      type: 'ONBOARDING_DOCS_DUE',
      title: 'Onboarding documents received',
      body: 'A new hire has sent in their NRIC, bank details and any permit needed. They can now be added to payroll.',
      linkUrl: '/onboarding',
    })

    revalidatePath('/onboarding')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('submitOnboarding error:', err)
    return { error: 'Something went wrong saving your documents. Please try again.' }
  }
}

/** The signed-in user's own submission, if one has been opened for them. */
export async function getMyOnboarding() {
  const session = await verifySession()
  return db.onboardingSubmission.findUnique({
    where: { userId: session.userId },
    include: {
      nricFrontDoc: { select: { id: true, blobId: true, fileName: true } },
      nricBackDoc: { select: { id: true, blobId: true, fileName: true } },
      bankProofDoc: { select: { id: true, blobId: true, fileName: true } },
      entryPermitDoc: { select: { id: true, blobId: true, fileName: true } },
    },
  })
}

/**
 * Is there an unsubmitted onboarding request for this user? Drives the dashboard
 * banner, so it is deliberately one indexed lookup and nothing more.
 */
export async function hasOutstandingOnboarding(userId: string): Promise<boolean> {
  const row = await db.onboardingSubmission.findUnique({
    where: { userId },
    select: { submittedAt: true },
  })
  return Boolean(row) && row?.submittedAt === null
}

/** HR view: who has been asked for documents, and who has actually sent them. */
export async function listOnboardingSubmissions() {
  await requireCapability('documents.admin')
  return db.onboardingSubmission.findMany({
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
          position: true,
          citizenship: true,
          startDate: true,
        },
      },
      nricFrontDoc: { select: { blobId: true } },
      nricBackDoc: { select: { blobId: true } },
      bankProofDoc: { select: { blobId: true } },
      entryPermitDoc: { select: { blobId: true } },
    },
    orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
  })
}
