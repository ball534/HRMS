'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireCapability, verifySession } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import { storage, putChecked, FileTooLargeError } from '@/lib/storage'
import { PASS_USER_SELECT, daysUntil, getLeadDaysConfig, reminderLeadDays } from '@/lib/workPasses'

export type WorkPassActionState = {
  success?: boolean
  error?: string
  errors?: Record<string, string[]>
}

const PASS_TYPES = [
  'NONE',
  'SG_WORK_PERMIT',
  'SG_S_PASS',
  'SG_EMPLOYMENT_PASS',
  'SG_DEPENDANT_PASS',
  'SG_LTVP_PLUS',
  'MY_WORK_PERMIT',
  'MY_EMPLOYMENT_PASS',
  'MY_DEPENDANT_PASS',
  'OTHER',
] as const

const upsertSchema = z.object({
  passId: z.string().uuid().optional(),
  userId: z.string().uuid(),
  passType: z.enum(PASS_TYPES),
  passNumber: z.string().optional(),
  workPermitNumber: z.string().optional(),
  finNumber: z.string().optional(),
  applicationDate: z.string().optional(),
  approvalDate: z.string().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  levy: z.coerce.number().optional(),
  notes: z.string().optional(),
})

// reminderLeadDays / daysUntil / PASS_USER_SELECT now live in
// src/lib/workPasses.ts so the daily cron can share them without going
// through a server action.

export async function upsertWorkPass(
  _state: WorkPassActionState,
  formData: FormData,
): Promise<WorkPassActionState> {
  try {
    const session = await requireCapability('workpass.write')

    const raw = Object.fromEntries(formData.entries())
    for (const k of ['passId', 'issueDate', 'expiryDate', 'levy', 'applicationDate', 'approvalDate']) {
      if (raw[k] === '') delete (raw as Record<string, unknown>)[k]
    }

    const parsed = upsertSchema.safeParse(raw)
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }
    const data = parsed.data

    if (data.passId) {
      await db.workPass.update({
        where: { id: data.passId },
        data: {
          passType: data.passType,
          passNumber: data.passNumber ?? null,
          workPermitNumber: data.workPermitNumber ?? null,
          finNumber: data.finNumber ?? null,
          applicationDate: data.applicationDate ? new Date(data.applicationDate) : null,
          approvalDate: data.approvalDate ? new Date(data.approvalDate) : null,
          issueDate: data.issueDate ? new Date(data.issueDate) : null,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
          levy: data.levy ?? null,
          notes: data.notes ?? null,
        },
      })
      await createAuditLog({
        userId: session.userId,
        action: 'WORK_PASS_UPDATED',
        entityType: 'WORK_PASS',
        entityId: data.passId,
      })
    } else {
      const created = await db.workPass.create({
        data: {
          userId: data.userId,
          passType: data.passType,
          passNumber: data.passNumber ?? null,
          workPermitNumber: data.workPermitNumber ?? null,
          finNumber: data.finNumber ?? null,
          applicationDate: data.applicationDate ? new Date(data.applicationDate) : null,
          approvalDate: data.approvalDate ? new Date(data.approvalDate) : null,
          issueDate: data.issueDate ? new Date(data.issueDate) : null,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
          levy: data.levy ?? null,
          notes: data.notes ?? null,
        },
      })
      await createAuditLog({
        userId: session.userId,
        action: 'WORK_PASS_CREATED',
        entityType: 'WORK_PASS',
        entityId: created.id,
        details: { userId: data.userId, passType: data.passType },
      })
    }

    revalidatePath(`/people/${data.userId}`)
    revalidatePath('/admin/work-passes')
    return { success: true }
  } catch (err) {
    console.error('upsertWorkPass error:', err)
    return { error: 'Failed to save work pass.' }
  }
}

export async function deleteWorkPass(passId: string): Promise<WorkPassActionState> {
  try {
    const session = await requireCapability('workpass.write')
    const pass = await db.workPass.findUniqueOrThrow({ where: { id: passId } })
    await db.workPass.delete({ where: { id: passId } })
    await createAuditLog({
      userId: session.userId,
      action: 'WORK_PASS_DELETED',
      entityType: 'WORK_PASS',
      entityId: passId,
      details: { userId: pass.userId },
    })
    revalidatePath(`/people/${pass.userId}`)
    revalidatePath('/admin/work-passes')
    return { success: true }
  } catch (err) {
    console.error('deleteWorkPass error:', err)
    return { error: 'Failed to delete work pass.' }
  }
}

/**
 * Active users + their work passes, grouped using the *type-specific* reminder
 * lead time (EP/S Pass = 4 months, Work Permit = 2 months):
 *   - expired: past expiry
 *   - due:     inside its reminder window (needs review before renewal)
 *   - ok:      outside the window
 */
export async function getWorkPassDashboard() {
  await requireCapability('workpass.read')

  const passes = await db.workPass.findMany({
    where: { passType: { not: 'NONE' } },
    include: { user: { select: PASS_USER_SELECT } },
    orderBy: { expiryDate: 'asc' },
  })

  const active = passes.filter(p => p.user.status === 'ACTIVE')
  // Lead times are read once, from Settings → Work passes, and reused for
  // every pass rather than being hardcoded per type.
  const leadDays = await getLeadDaysConfig()
  const bucket = (p: (typeof passes)[number]): 'expired' | 'due' | 'ok' => {
    const d = daysUntil(p.expiryDate)
    if (d === null) return 'ok'
    if (d < 0) return 'expired'
    if (d <= reminderLeadDays(p.passType, leadDays)) return 'due'
    return 'ok'
  }

  return {
    expired: active.filter(p => bucket(p) === 'expired'),
    due: active.filter(p => bucket(p) === 'due'),
    ok: active.filter(p => bucket(p) === 'ok'),
    // Surfaced so the dashboard can say what window it is actually using.
    leadDays,
  }
}

// The cron's reminder query used to live here as an exported (and completely
// unauthenticated) server action that returned every foreign worker's FIN,
// passport number and expiry date to any caller. It is now
// `findWorkPassesDueForReminder` in src/lib/workPasses.ts — reachable by the
// cron, not by the network.

export async function getUserWorkPasses(userId: string) {
  await requireCapability('workpass.read')
  return db.workPass.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * A user's own work passes, with their attachments. No capability needed —
 * authorization is "this is you", which is what lets an employee see their own
 * pass and its scans without being able to see anyone else's.
 */
export async function getMyWorkPasses() {
  const session = await verifySession()
  return db.workPass.findMany({
    where: { userId: session.userId },
    include: {
      documents: {
        select: { id: true, blobId: true, fileName: true, label: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

// ============================================================
// Attachments — the scans that prove a pass exists
// ============================================================

const ATTACHMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

/**
 * Attach a scan to a work pass. HR only, deliberately: a work pass is a record
 * the company is answerable for, and letting employees upload their own would
 * make "is this the document MOM issued?" unanswerable.
 */
export async function uploadWorkPassDocument(
  _state: WorkPassActionState,
  formData: FormData,
): Promise<WorkPassActionState> {
  try {
    const session = await requireCapability('workpass.write')

    const passId = String(formData.get('passId') ?? '')
    const label = String(formData.get('label') ?? '').trim()
    const file = formData.get('file')

    const pass = await db.workPass.findUnique({
      where: { id: passId },
      select: { id: true, userId: true },
    })
    if (!pass) return { error: 'Work pass not found.' }

    if (!(file instanceof File) || file.size === 0) {
      return { errors: { file: ['Choose a file to upload.'] } }
    }
    if (!ATTACHMENT_TYPES.includes(file.type)) {
      return { errors: { file: ['Upload a PDF or an image.'] } }
    }

    let stored
    try {
      stored = await putChecked(Buffer.from(await file.arrayBuffer()), file.type)
    } catch (err) {
      if (err instanceof FileTooLargeError) return { errors: { file: [err.message] } }
      throw err
    }

    const created = await db.workPassDocument.create({
      data: {
        workPassId: pass.id,
        blobId: stored.blobId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        label: label || null,
        uploadedById: session.userId,
      },
      select: { id: true },
    })

    await createAuditLog({
      userId: session.userId,
      action: 'WORK_PASS_DOC_UPLOADED',
      entityType: 'WORK_PASS',
      entityId: pass.id,
      details: { documentId: created.id, label: label || null, fileName: file.name },
    })

    revalidatePath(`/people/${pass.userId}`)
    return { success: true }
  } catch (err) {
    console.error('uploadWorkPassDocument error:', err)
    return { error: 'Failed to upload the file.' }
  }
}

export async function deleteWorkPassDocument(documentId: string): Promise<WorkPassActionState> {
  try {
    const session = await requireCapability('workpass.write')
    const doc = await db.workPassDocument.findUnique({
      where: { id: documentId },
      select: { id: true, blobId: true, workPass: { select: { id: true, userId: true } } },
    })
    if (!doc) return { error: 'File not found.' }

    await db.workPassDocument.delete({ where: { id: documentId } })
    // Give up this record's reference; the bytes go when nothing else holds one.
    await storage.release(doc.blobId)

    await createAuditLog({
      userId: session.userId,
      action: 'WORK_PASS_DOC_DELETED',
      entityType: 'WORK_PASS',
      entityId: doc.workPass.id,
      details: { documentId },
    })

    revalidatePath(`/people/${doc.workPass.userId}`)
    return { success: true }
  } catch (err) {
    console.error('deleteWorkPassDocument error:', err)
    return { error: 'Failed to delete the file.' }
  }
}
