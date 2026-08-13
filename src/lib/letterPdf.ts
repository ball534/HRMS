import 'server-only'

import { PDFDocument } from 'pdf-lib'
import { LETTER_MERGE_FIELDS } from '@/lib/letterTemplate'

/**
 * Letter generation, without Google.
 *
 * Letters used to be produced through Google Docs: copy a template Doc,
 * `replaceAllText` the `{{placeholders}}` via the Docs API, export the copy to
 * PDF through Drive, then delete the working copy. That made the whole letters
 * workflow depend on a Google service account and a Drive folder.
 *
 * A template is now a **fillable PDF**. HR prepares one per letter type with an
 * AcroForm text field named after each merge field it wants, the app fills those
 * fields with pdf-lib, and then flattens the form so the delivered letter is not
 * an editable document.
 *
 * The trade-off, stated plainly: PDF form fields are fixed boxes, so long values
 * clip rather than reflow the way they did in a Doc. Keep the fields generously
 * sized — particularly `position`, `department` and `company`.
 */

/**
 * The AcroForm text field names present in a PDF.
 *
 * Used at upload time so the admin screen can tell HR which merge fields their
 * template will actually receive — and, more usefully, which ones it has
 * misspelled and will therefore silently leave blank.
 */
export async function extractFieldNames(pdfBytes: Buffer): Promise<string[]> {
  try {
    const pdf = await PDFDocument.load(pdfBytes)
    return pdf.getForm().getFields().map(f => f.getName())
  } catch (err) {
    console.error('[letterPdf] could not read form fields:', err)
    return []
  }
}

export type FillResult = {
  pdf: Buffer
  /** Fields filled from the supplied values. */
  filled: string[]
  /** Template fields that match no known merge field — almost always a typo. */
  unknownFields: string[]
  /** Merge fields the template has no box for. Informational, not an error. */
  unusedValues: string[]
}

/**
 * Fill a template's form fields and flatten the result.
 *
 * Missing values are written as an empty string rather than left as an unfilled
 * form box, so a blank NRIC prints as blank rather than showing the field's
 * placeholder text.
 */
export async function fillLetterTemplate(opts: {
  templateBytes: Buffer
  replacements: Record<string, string>
}): Promise<FillResult> {
  const pdf = await PDFDocument.load(opts.templateBytes)
  const form = pdf.getForm()

  const filled: string[] = []
  const unknownFields: string[] = []
  const known = new Set<string>(LETTER_MERGE_FIELDS)

  for (const field of form.getFields()) {
    const name = field.getName()

    if (!known.has(name)) {
      unknownFields.push(name)
      continue
    }

    try {
      form.getTextField(name).setText(opts.replacements[name] ?? '')
      filled.push(name)
    } catch {
      // Field exists but isn't a text field (checkbox, dropdown). Skip it
      // rather than failing the whole letter.
      unknownFields.push(name)
    }
  }

  const unusedValues = LETTER_MERGE_FIELDS.filter(f => !filled.includes(f))

  // Flatten so the delivered PDF is not an editable form.
  form.flatten()

  return {
    pdf: Buffer.from(await pdf.save()),
    filled,
    unknownFields,
    unusedValues,
  }
}

/**
 * Stamp a drawn signature (PNG data URL) onto the last page.
 *
 * Unchanged in substance from the Google-era implementation — it always worked
 * on PDF bytes with pdf-lib, because Docs can only embed images by public URL.
 * It now takes and returns bytes instead of reading and writing a Drive file.
 */
export async function stampSignature(opts: {
  pdfBytes: Buffer
  signatureDataUrl: string
}): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(opts.pdfBytes)

  const pngBytes = dataUrlToBuffer(opts.signatureDataUrl)
  const png = await pdfDoc.embedPng(pngBytes)

  const pages = pdfDoc.getPages()
  const page = pages[pages.length - 1]

  // Signature box: ~180pt wide, anchored bottom-left of the last page, sitting
  // above where templates print the signature line.
  const boxWidth = 180
  const scale = boxWidth / png.width
  page.drawImage(png, {
    x: 72, // 1" left margin
    y: 90,
    width: boxWidth,
    height: Math.min(png.height * scale, 70),
  })

  return Buffer.from(await pdfDoc.save())
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  return Buffer.from(base64, 'base64')
}
