'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireCapability } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import { storage, putChecked, FileTooLargeError } from '@/lib/storage'
import {
  LETTER_MERGE_FIELDS,
  buildPlaceholderTemplate,
  extractFieldNames,
} from '@/lib/letterPdf'
import type { LetterType } from '@/generated/prisma/client'

/**
 * Letter template administration.
 *
 * Templates used to be Google Docs, edited outside the app and referenced by id
 * in an environment variable — so changing one needed both Google access and a
 * redeploy. A template is now a fillable PDF stored in the database, uploaded
 * here.
 */

export type TemplateActionState = { success?: boolean; error?: string }

export type LetterTemplateRow = {
  type: LetterType
  fileName: string
  blobId: string
  /** AcroForm fields found in the PDF. */
  fieldNames: string[]
  /** Fields the app can fill that this template has no box for. */
  unusedMergeFields: string[]
  /** Fields in the PDF that match no merge field — usually a typo. */
  unrecognisedFields: string[]
  isPlaceholder: boolean
  uploadedByName: string | null
  updatedAt: string
}

export async function getLetterTemplates(): Promise<{
  rows: LetterTemplateRow[]
  missingTypes: LetterType[]
  availableMergeFields: string[]
}> {
  await requireCapability('letters.write')

  const templates = await db.letterTemplate.findMany({
    include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    orderBy: { type: 'asc' },
  })

  const known = new Set<string>(LETTER_MERGE_FIELDS)

  const rows: LetterTemplateRow[] = templates.map(t => ({
    type: t.type,
    fileName: t.fileName,
    blobId: t.blobId,
    fieldNames: t.fieldNames,
    unusedMergeFields: LETTER_MERGE_FIELDS.filter(f => !t.fieldNames.includes(f)),
    unrecognisedFields: t.fieldNames.filter(f => !known.has(f)),
    isPlaceholder: t.isPlaceholder,
    uploadedByName: t.uploadedBy ? `${t.uploadedBy.firstName} ${t.uploadedBy.lastName}` : null,
    updatedAt: t.updatedAt.toISOString(),
  }))

  const missingTypes = (['EMPLOYMENT', 'CONFIRMATION'] as LetterType[]).filter(
    type => !templates.some(t => t.type === type),
  )

  return { rows, missingTypes, availableMergeFields: [...LETTER_MERGE_FIELDS] }
}

/**
 * Upload a replacement template.
 *
 * The PDF's form fields are read on upload and stored, so the admin screen can
 * show HR exactly which merge fields their template will receive — and flag
 * misspelled field names, which would otherwise just print blank with no
 * indication anything was wrong.
 */
export async function uploadLetterTemplate(formData: FormData): Promise<TemplateActionState> {
  try {
    const session = await requireCapability('letters.write')

    const type = formData.get('type') as LetterType | null
    const file = formData.get('file') as File | null

    if (type !== 'EMPLOYMENT' && type !== 'CONFIRMATION') {
      return { error: 'Choose which letter this template is for' }
    }
    if (!file || file.size === 0) return { error: 'Choose a PDF file' }
    if (file.type !== 'application/pdf') return { error: 'The template must be a PDF' }

    const bytes = Buffer.from(await file.arrayBuffer())
    const fieldNames = await extractFieldNames(bytes)

    if (fieldNames.length === 0) {
      return {
        error:
          'That PDF has no form fields, so there is nowhere to merge the employee details. Add text fields named after the merge fields listed below, then upload it again.',
      }
    }

    let stored
    try {
      stored = await putChecked(bytes, 'application/pdf')
    } catch (err) {
      if (err instanceof FileTooLargeError) return { error: err.message }
      throw err
    }

    const existing = await db.letterTemplate.findUnique({ where: { type } })

    await db.letterTemplate.upsert({
      where: { type },
      create: {
        type,
        blobId: stored.blobId,
        fileName: file.name,
        fieldNames,
        isPlaceholder: false,
        uploadedById: session.userId,
      },
      update: {
        blobId: stored.blobId,
        fileName: file.name,
        fieldNames,
        isPlaceholder: false,
        uploadedById: session.userId,
      },
    })

    // Release the superseded template's bytes. Letters already generated keep
    // their own blobs — they are separate references and are not affected.
    if (existing && existing.blobId !== stored.blobId) {
      await storage.release(existing.blobId)
    }

    await createAuditLog({
      userId: session.userId,
      action: 'EMPLOYMENT_LETTER_GENERATED',
      entityType: 'EMPLOYMENT_LETTER',
      details: {
        templateUpload: true,
        type,
        fileName: file.name,
        fieldNames,
        replacedPlaceholder: existing?.isPlaceholder ?? false,
      },
    })

    revalidatePath('/admin/letter-templates')
    return { success: true }
  } catch (err) {
    console.error('uploadLetterTemplate error:', err)
    return { error: 'Failed to save the template' }
  }
}

/**
 * Install the built-in placeholder template for a letter type.
 *
 * Generated on the fly by pdf-lib. It exists so the letters workflow works
 * before anyone has prepared company stationery, and doubles as a reference PDF
 * showing which field names the app fills.
 */
export async function installPlaceholderTemplate(
  type: LetterType,
): Promise<TemplateActionState> {
  try {
    const session = await requireCapability('letters.write')

    if (type !== 'EMPLOYMENT' && type !== 'CONFIRMATION') {
      return { error: 'Unknown letter type' }
    }

    const existing = await db.letterTemplate.findUnique({ where: { type } })
    if (existing && !existing.isPlaceholder) {
      return {
        error:
          'There is already a real template for this letter type. Upload a replacement instead — installing the placeholder over it would lose your stationery.',
      }
    }

    const bytes = await buildPlaceholderTemplate(type)
    const fieldNames = await extractFieldNames(bytes)
    const stored = await putChecked(bytes, 'application/pdf')

    await db.letterTemplate.upsert({
      where: { type },
      create: {
        type,
        blobId: stored.blobId,
        fileName: `${type === 'EMPLOYMENT' ? 'Employment' : 'Confirmation'} Letter (placeholder).pdf`,
        fieldNames,
        isPlaceholder: true,
        uploadedById: session.userId,
      },
      update: {
        blobId: stored.blobId,
        fieldNames,
        isPlaceholder: true,
        uploadedById: session.userId,
      },
    })

    if (existing && existing.blobId !== stored.blobId) {
      await storage.release(existing.blobId)
    }

    revalidatePath('/admin/letter-templates')
    return { success: true }
  } catch (err) {
    console.error('installPlaceholderTemplate error:', err)
    return { error: 'Failed to install the placeholder template' }
  }
}
