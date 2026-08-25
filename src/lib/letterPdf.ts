import 'server-only'

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import type { LetterSection } from '@/lib/letterSections'

/**
 * Letter generation.
 *
 * Two earlier versions of this file are worth knowing about, because the
 * shortcomings of each are what this one is shaped by:
 *
 *   1. Google Docs. Copy a template Doc, `replaceAllText` the placeholders,
 *      export to PDF. Tied the whole letters flow to a service account.
 *   2. Fillable PDFs. HR uploaded a template per letter type and the app filled
 *      its AcroForm boxes. No Google, but the wording could not be edited from
 *      inside the app, and a value longer than the box someone had drawn was
 *      silently clipped — form fields do not reflow.
 *
 * Now the app draws the letter itself from the sections held on the letter
 * record: text wraps to the measured width, sections break across pages when
 * they have to, and the signature blocks are laid out relative to where the
 * text actually ended rather than at a fixed offset from the bottom of a
 * template nobody can see.
 */

// A4 portrait, 1" margins.
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 72
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

const BODY_SIZE = 10.5
const BODY_LEADING = 15
const TITLE_SIZE = 11.5
const HEADING_SIZE = 18

const INK = rgb(0.1, 0.1, 0.12)
const MUTED = rgb(0.42, 0.42, 0.45)
const RULE = rgb(0.8, 0.8, 0.84)

export type LetterPdfInput = {
  heading: string
  /** Small line under the heading — the company, or the letter kind. */
  subheading?: string
  /** Right-aligned reference line: employee id, date. */
  reference?: string[]
  sections: LetterSection[]
  /** Name printed under the company signature line. */
  signatoryName?: string
  signatoryPosition?: string
  /** Name printed under the employee's signature line. */
  employeeName: string
  /** Drawn signatures, as PNG data URLs. */
  signatorySignatureDataUrl?: string | null
  employeeSignatureDataUrl?: string | null
}

/**
 * Break `text` into lines that fit `maxWidth`, honouring the newlines already
 * in it. A single word longer than the line (a URL, a long reference number) is
 * split rather than allowed to run off the page.
 */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []

  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('')
      continue
    }

    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate
        continue
      }

      if (line) lines.push(line)

      // The word itself doesn't fit — hard-split it.
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = ''
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
            lines.push(chunk)
            chunk = char
          } else {
            chunk += char
          }
        }
        line = chunk
      } else {
        line = word
      }
    }
    lines.push(line)
  }

  return lines
}

/** A cursor that adds pages as the text runs past the bottom margin. */
class Layout {
  page: PDFPage
  y: number

  constructor(
    private pdf: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
  ) {
    this.page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.y = PAGE_HEIGHT - MARGIN
  }

  /** Room for `height` more points, or start a new page. */
  private ensure(height: number) {
    if (this.y - height >= MARGIN) return
    this.page = this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.y = PAGE_HEIGHT - MARGIN
  }

  gap(points: number) {
    this.y -= points
  }

  line(text: string, opts: { size?: number; bold?: boolean; color?: typeof INK; x?: number } = {}) {
    const size = opts.size ?? BODY_SIZE
    this.ensure(size + 4)
    this.page.drawText(text, {
      x: opts.x ?? MARGIN,
      y: this.y - size,
      size,
      font: opts.bold ? this.bold : this.font,
      color: opts.color ?? INK,
    })
    this.y -= size + 4
  }

  paragraph(text: string, opts: { size?: number; bold?: boolean; color?: typeof INK } = {}) {
    const size = opts.size ?? BODY_SIZE
    const font = opts.bold ? this.bold : this.font
    for (const line of wrapText(text, font, size, CONTENT_WIDTH)) {
      this.ensure(BODY_LEADING)
      if (line !== '') {
        this.page.drawText(line, {
          x: MARGIN,
          y: this.y - size,
          size,
          font,
          color: opts.color ?? INK,
        })
      }
      this.y -= BODY_LEADING
    }
  }

  rule() {
    this.ensure(10)
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.75,
      color: RULE,
    })
    this.y -= 10
  }

  /**
   * Two signature blocks side by side. Kept together on one page — a signature
   * line stranded on its own page reads as an unsigned letter.
   */
  signatureBlocks(blocks: { label: string; name: string; position?: string; image?: PdfImage | null }[]) {
    const BLOCK_HEIGHT = 120
    this.ensure(BLOCK_HEIGHT)
    const top = this.y
    const columnWidth = (CONTENT_WIDTH - 40) / 2

    blocks.forEach((block, index) => {
      const x = MARGIN + index * (columnWidth + 40)
      let y = top

      this.page.drawText(block.label, { x, y: y - 9, size: 8, font: this.font, color: MUTED })
      y -= 24

      if (block.image) {
        const width = Math.min(columnWidth - 10, 170)
        const scale = width / block.image.width
        const height = Math.min(block.image.height * scale, 46)
        this.page.drawImage(block.image.image, { x, y: y - height, width, height })
      }
      y -= 52

      this.page.drawLine({
        start: { x, y },
        end: { x: x + columnWidth, y },
        thickness: 0.75,
        color: RULE,
      })
      y -= 14

      this.page.drawText(block.name || '—', { x, y: y - 9, size: 9, font: this.bold, color: INK })
      y -= 14

      if (block.position) {
        this.page.drawText(block.position, { x, y: y - 8, size: 8, font: this.font, color: MUTED })
      }
    })

    this.y = top - BLOCK_HEIGHT
  }
}

type PdfImage = { image: Awaited<ReturnType<PDFDocument['embedPng']>>; width: number; height: number }

async function embedSignature(pdf: PDFDocument, dataUrl: string | null | undefined): Promise<PdfImage | null> {
  if (!dataUrl?.startsWith('data:image')) return null
  try {
    const comma = dataUrl.indexOf(',')
    const bytes = Buffer.from(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl, 'base64')
    const image = await pdf.embedPng(bytes)
    return { image, width: image.width, height: image.height }
  } catch (err) {
    // A signature that won't embed must not cost us the letter — the record
    // still holds the data URL, and the audit log still says who signed.
    console.error('[letterPdf] could not embed signature image:', err)
    return null
  }
}

/** Draw the letter. Returns the PDF bytes. */
export async function renderLetterPdf(input: LetterPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const [signatoryImage, employeeImage] = await Promise.all([
    embedSignature(pdf, input.signatorySignatureDataUrl),
    embedSignature(pdf, input.employeeSignatureDataUrl),
  ])

  const layout = new Layout(pdf, font, bold)

  // --- Header ---
  layout.line(input.heading, { size: HEADING_SIZE, bold: true })
  if (input.subheading) {
    layout.gap(2)
    layout.line(input.subheading, { size: 9, color: MUTED })
  }
  layout.gap(6)
  layout.rule()
  for (const ref of input.reference ?? []) {
    layout.line(ref, { size: 8.5, color: MUTED })
  }
  layout.gap(10)

  // --- Body ---
  for (const section of input.sections) {
    layout.gap(8)
    layout.paragraph(section.title, { size: TITLE_SIZE, bold: true })
    layout.gap(2)
    layout.paragraph(section.body)
  }

  // --- Signatures ---
  layout.gap(24)
  layout.signatureBlocks([
    {
      label: 'Signed for and on behalf of the Group',
      name: input.signatoryName ?? '',
      position: input.signatoryPosition,
      image: signatoryImage,
    },
    {
      label: 'Accepted by the employee',
      name: input.employeeName,
      image: employeeImage,
    },
  ])

  return Buffer.from(await pdf.save())
}
