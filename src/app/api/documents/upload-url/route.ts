import { NextRequest, NextResponse } from 'next/server'
import { requireRole, verifySession } from '@/lib/dal'
import {
  uploadFile,
  getDocumentFolderPath,
  getSharedDocumentFolderPath,
} from '@/lib/google-drive'
import { db } from '@/lib/db'

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
  const session = await verifySession()

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const scope = (formData.get('scope') as string | null) ?? 'EMPLOYEE'
  const category = (formData.get('category') as string | null) ?? 'OTHER'
  const employeeIdsRaw = formData.get('employeeIds') as string | null
  let employeeIds: string[] = []
  if (employeeIdsRaw) {
    try {
      const parsed = JSON.parse(employeeIdsRaw)
      if (Array.isArray(parsed)) employeeIds = parsed.filter((x): x is string => typeof x === 'string')
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

  const isHR = session.role === 'ADMIN' || session.role === 'HR'

  // ---- Permission checks ----
  if (scope === 'COMPANY' && !isHR) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (scope === 'EMPLOYEE') {
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return NextResponse.json({ error: 'employeeIds required for EMPLOYEE scope' }, { status: 400 })
    }
    if (!isHR) {
      // Employees can only upload to their own folder, one target only.
      if (employeeIds.length !== 1 || employeeIds[0] !== session.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
  }

  // ---- Choose Drive folder ----
  let folderPath: string[]
  if (scope === 'COMPANY') {
    folderPath = getDocumentFolderPath('COMPANY', undefined, category)
  } else if (employeeIds.length > 1) {
    folderPath = getSharedDocumentFolderPath(category)
  } else {
    const employee = await db.user.findUnique({
      where: { id: employeeIds[0] },
      select: { firstName: true, lastName: true },
    })
    const employeeName = employee
      ? `${employee.firstName} ${employee.lastName}`
      : undefined
    folderPath = getDocumentFolderPath('EMPLOYEE', employeeName, category)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const { fileId } = await uploadFile(buffer, file.name, file.type, folderPath)

  return NextResponse.json({
    key: fileId,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  })
}
