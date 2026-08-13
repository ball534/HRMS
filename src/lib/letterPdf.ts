import 'server-only'

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

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
 * Every merge field a template may use. This is the contract with whoever
 * prepares the PDF: name a text field one of these and it gets filled; name it
 * anything else and it is left alone.
 *
 * Kept in step with `buildReplacements` in src/actions/letters.ts.
 */
export const LETTER_MERGE_FIELDS = [
  'firstName',
  'lastName',
  'fullName',
  'employeeNumber',
  'nric',
  'passportNumber',
  'position',
  'department',
  'company',
  'country',
  'email',
  'startDate',
  'probationEndDate',
  'confirmationDate',
  'today',
  'approvingOfficerName',
] as const

export type LetterMergeField = (typeof LETTER_MERGE_FIELDS)[number]

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

// ============================================================
// Placeholder template generation
// ============================================================

/**
 * Build a plain but complete fillable letter template.
 *
 * This exists so the letters workflow works the moment the app is installed,
 * before anyone has prepared real company stationery. It is deliberately
 * unbranded — it is scaffolding, and the admin screen labels it as a
 * placeholder so nobody mistakes it for an approved template.
 *
 * It also serves as a reference: open it in Acrobat and you can see exactly
 * which field names the app fills.
 */
export async function buildPlaceholderTemplate(
  type: 'EMPLOYMENT' | 'CONFIRMATION',
): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89]) // A4 portrait
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const form = pdf.getForm()

  const left = 72
  const right = 595.28 - 72
  let y = 780

  const grey = rgb(0.42, 0.42, 0.45)
  const black = rgb(0.1, 0.1, 0.12)

  function text(value: string, opts: { size?: number; bold?: boolean; color?: typeof black } = {}) {
    page.drawText(value, {
      x: left,
      y,
      size: opts.size ?? 11,
      font: opts.bold ? bold : font,
      color: opts.color ?? black,
    })
  }

  /** A labelled, fillable text box. */
  function field(name: string, label: string, opts: { width?: number } = {}) {
    page.drawText(label, { x: left, y, size: 8, font, color: grey })
    y -= 15
    const box = form.createTextField(name)
    box.setText('')
    box.addToPage(page, {
      x: left,
      y: y - 3,
      width: opts.width ?? right - left,
      height: 18,
      borderWidth: 0.5,
      borderColor: rgb(0.8, 0.8, 0.84),
      backgroundColor: rgb(0.98, 0.98, 0.99),
      font,
    })
    y -= 26
  }

  // --- Header ---
  const title = type === 'EMPLOYMENT' ? 'LETTER OF EMPLOYMENT' : 'LETTER OF CONFIRMATION'
  text(title, { size: 16, bold: true })
  y -= 12
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 0.75,
    color: rgb(0.8, 0.8, 0.84),
  })
  y -= 24

  text('PLACEHOLDER TEMPLATE — replace with approved company stationery', {
    size: 8,
    color: grey,
  })
  y -= 28

  // --- Fields ---
  field('company', 'Company')
  field('today', 'Date')
  y -= 6

  field('fullName', 'Employee name')
  field('employeeNumber', 'Employee ID', { width: 220 })
  field('email', 'Email')
  field('position', 'Position')
  field('department', 'Department')
  field('country', 'Country', { width: 220 })
  field('startDate', 'Start date', { width: 220 })

  if (type === 'EMPLOYMENT') {
    field('probationEndDate', 'Probation end date', { width: 220 })
  } else {
    field('confirmationDate', 'Confirmation date', { width: 220 })
  }

  y -= 10
  const body =
    type === 'EMPLOYMENT'
      ? 'We are pleased to confirm your employment on the terms recorded above.'
      : 'We are pleased to confirm that you have successfully completed your probation period.'
  text(body, { size: 10 })
  y -= 40

  text('Signed for and on behalf of the company', { size: 8, color: grey })
  y -= 46 // leaves room for the stamped signature image at y=90..160

  field('approvingOfficerName', 'Name of signing officer', { width: 260 })

  return Buffer.from(await pdf.save())
}
