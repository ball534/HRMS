import { NextRequest, NextResponse } from 'next/server'
import { verifySessionApi, withApiAuth } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { putChecked, FileTooLargeError } from '@/lib/storage'

/**
 * Document upload.
 *
 * Files land in Postgres via the storage layer rather than in a Google Drive
 * folder. The route no longer needs to work out *where* to put the file — the
 * Document row's scope, category and employeeId already say what it is, and the
 * old Drive folder hierarchy was duplicating that information in a second,
 * silently-divergent place.
 *
 * The route name is a leftover from an S3 presigned-URL design. It has never
 * returned a URL; it receives the bytes and returns the stored blob's id.
 */

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
])

const VALID_CATEGORIES = new Set([
  'CONTRACTS',
  'PAYSLIPS',
  'MEDICAL',
  'CERTIFICATIONS',
  'PERSONAL_DOCS',
  'OTHER',
])

export async function POST(req: NextRequest) {
  return withApiAuth(() => handler(req))
}

async function handler(req: NextRequest) {
  const session = await verifySessionApi()

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const scope = (formData.get('scope') as string | null) ?? 'EMPLOYEE'
  const category = (formData.get('category') as string | null) ?? 'OTHER'
  const employeeIdsRaw = formData.get('employeeIds') as string | null

  let employeeIds: string[] = []
  if (employeeIdsRaw) {
    try {
      const parsed = JSON.parse(employeeIdsRaw)
      if (Array.isArray(parsed)) {
        employeeIds = parsed.filter((x): x is string => typeof x === 'string')
      }
    } catch {
      return NextResponse.json({ error: 'Invalid employeeIds' }, { status: 400 })
    }
  }

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
  }
  if (!VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  const isHR = can(session.role, 'documents.admin')

  // ---- Permission checks ----
  if (scope === 'COMPANY' && !isHR) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (scope === 'EMPLOYEE') {
    if (employeeIds.length === 0) {
      return NextResponse.json({ error: 'employeeIds required for EMPLOYEE scope' }, { status: 400 })
    }
    if (!isHR) {
      // Employees may only upload against their own record, one target only.
      if (employeeIds.length !== 1 || employeeIds[0] !== session.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const stored = await putChecked(buffer, file.type)
    return NextResponse.json({
      // `key` is kept as the response field name so existing clients keep
      // working; it now carries a blob id rather than a Drive file id.
      key: stored.blobId,
      blobId: stored.blobId,
      fileName: file.name,
      fileSize: stored.fileSize,
      mimeType: stored.mimeType,
      deduped: stored.deduped,
    })
  } catch (err) {
    if (err instanceof FileTooLargeError) {
      return NextResponse.json({ error: err.message }, { status: 413 })
    }
    throw err
  }
}
