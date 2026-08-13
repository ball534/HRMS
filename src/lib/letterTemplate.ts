/**
 * Letter template definition and the built-in placeholder.
 *
 * Deliberately NOT marked `server-only`: this is pure pdf-lib with no database
 * or secret access, which lets the app and the standalone script
 * `scripts/make-placeholder-templates.ts` share one implementation. That script
 * previously carried its own copy of the builder — exactly the kind of
 * duplication that drifts out of step.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

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
