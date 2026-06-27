import 'server-only'

import { google } from 'googleapis'
import { PDFDocument } from 'pdf-lib'
import { getAuth, uploadFile, updateFileContent, downloadFile } from '@/lib/google-drive'

// ============================================================
// Google Docs → PDF letter generation
//
// Letters are authored by HR as Google Doc templates with {{merge}}
// placeholders. To generate a letter we copy the template, replace the
// placeholders with the employee's data, export the copy as a PDF, store
// the PDF in the employee's Drive folder, then delete the working copy.
//
// Signatures are NOT inserted into the Doc (Docs can only embed images by
// public URL). Instead the drawn signature is stamped onto the exported
// PDF with pdf-lib at signing time — see stampSignatureOnDrivePdf.
// ============================================================

function getDocs() {
  return google.docs({ version: 'v1', auth: getAuth() })
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() })
}

export function getLetterTemplateId(type: 'EMPLOYMENT' | 'CONFIRMATION'): string | undefined {
  return type === 'EMPLOYMENT'
    ? process.env.GOOGLE_DOCS_EMPLOYMENT_TEMPLATE_ID
    : process.env.GOOGLE_DOCS_CONFIRMATION_TEMPLATE_ID
}

/**
 * Copy a template Doc, merge {{placeholders}}, export as PDF, store in Drive,
 * and clean up the working copy. Returns the stored PDF's Drive id + link.
 *
 * `replacements` keys are bare names (e.g. "firstName"); they are matched as
 * `{{firstName}}` in the template.
 */
export async function generateLetterPdfToDrive(opts: {
  templateDocId: string
  replacements: Record<string, string>
  fileName: string
  folderPath: string[]
}): Promise<{ fileId: string; webViewLink: string }> {
  const drive = getDrive()
  const docs = getDocs()

  // 1. Copy the template into a working Doc.
  const copy = await drive.files.copy({
    fileId: opts.templateDocId,
    requestBody: { name: `${opts.fileName} (working)` },
    fields: 'id',
    supportsAllDrives: true,
  })
  const workingDocId = copy.data.id!

  try {
    // 2. Replace all {{placeholders}}.
    const requests = Object.entries(opts.replacements).map(([key, value]) => ({
      replaceAllText: {
        containsText: { text: `{{${key}}}`, matchCase: false },
        replaceText: value ?? '',
      },
    }))
    if (requests.length > 0) {
      await docs.documents.batchUpdate({
        documentId: workingDocId,
        requestBody: { requests },
      })
    }

    // 3. Export the working Doc as a PDF.
    const exportRes = await drive.files.export(
      { fileId: workingDocId, mimeType: 'application/pdf' },
      { responseType: 'arraybuffer' },
    )
    const pdfBuffer = Buffer.from(exportRes.data as ArrayBuffer)

    // 4. Store the PDF in the employee's Letters folder.
    return await uploadFile(pdfBuffer, opts.fileName, 'application/pdf', opts.folderPath)
  } finally {
    // 5. Always remove the working copy.
    await drive.files.delete({ fileId: workingDocId, supportsAllDrives: true }).catch(() => {})
  }
}

/**
 * Stamp a drawn signature (PNG data URL) onto an existing PDF in Drive and
 * replace the file content in place. The signature is placed in a box at the
 * bottom-left of the last page (where letter templates put the signature line).
 */
export async function stampSignatureOnDrivePdf(opts: {
  fileId: string
  signatureDataUrl: string
}): Promise<{ fileId: string; webViewLink: string }> {
  const pdfBytes = await downloadFile(opts.fileId)
  const pdfDoc = await PDFDocument.load(pdfBytes)

  const pngBytes = dataUrlToBuffer(opts.signatureDataUrl)
  const png = await pdfDoc.embedPng(pngBytes)

  const pages = pdfDoc.getPages()
  const page = pages[pages.length - 1]
  const { width } = page.getSize()

  // Signature box: ~180pt wide, anchored bottom-left of the last page.
  const boxWidth = 180
  const scale = boxWidth / png.width
  const drawWidth = boxWidth
  const drawHeight = png.height * scale
  page.drawImage(png, {
    x: 72, // 1" left margin
    y: 90, // sits above a printed signature line in the template
    width: drawWidth,
    height: Math.min(drawHeight, 70),
  })
  void width

  const stamped = Buffer.from(await pdfDoc.save())
  return updateFileContent(opts.fileId, stamped, 'application/pdf')
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  return Buffer.from(base64, 'base64')
}
