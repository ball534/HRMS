'use server'

import { db } from '@/lib/db'
import { verifySession, requireRole } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import { getDownloadUrl, deleteFile } from '@/lib/google-drive'

// ============================================================
// Types
// ============================================================

export type DocumentCategory =
  | 'CONTRACTS'
  | 'PAYSLIPS'
  | 'MEDICAL'
  | 'CERTIFICATIONS'
  | 'PERSONAL_DOCS'
  | 'OTHER'

export type DocumentRecord = {
  id: string
  name: string
  scope: 'COMPANY' | 'EMPLOYEE'
  category: DocumentCategory
  employeeId: string | null
  employee: { firstName: string; lastName: string } | null
  s3Key: string
  fileName: string
  fileSize: number
  mimeType: string
  uploadedById: string
  uploadedBy: { firstName: string; lastName: string }
  createdAt: string
  updatedAt: string
  downloadUrl: string
  canDelete: boolean
}

const VALID_CATEGORIES: DocumentCategory[] = [
  'CONTRACTS',
  'PAYSLIPS',
  'MEDICAL',
  'CERTIFICATIONS',
  'PERSONAL_DOCS',
  'OTHER',
]

function isHRRole(role: string): boolean {
  return role === 'ADMIN' || role === 'HR'
}

// ============================================================
// uploadDocument — supports single target OR mass-push to N employees
// ============================================================

export async function uploadDocument(data: {
  name: string
  scope: 'COMPANY' | 'EMPLOYEE'
  category: DocumentCategory
  employeeIds?: string[]
  s3Key: string
  fileName: string
  fileSize: number
  mimeType: string
}): Promise<{ success: boolean; count?: number; error?: string }> {
  const session = await verifySession()
  const { name, scope, category, employeeIds = [], s3Key, fileName, fileSize, mimeType } = data

  if (!name || !s3Key || !fileName || !fileSize || !mimeType || !scope || !category) {
    return { success: false, error: 'Missing required fields' }
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return { success: false, error: 'Invalid category' }
  }

  const isHR = isHRRole(session.role)

  if (scope === 'COMPANY' && !isHR) {
    return { success: false, error: 'Forbidden' }
  }
  if (scope === 'EMPLOYEE') {
    if (employeeIds.length === 0) {
      return { success: false, error: 'employeeIds required for EMPLOYEE scope' }
    }
    if (!isHR && (employeeIds.length !== 1 || employeeIds[0] !== session.userId)) {
      return { success: false, error: 'Forbidden' }
    }
  }

  if (scope === 'COMPANY') {
    const doc = await db.document.create({
      data: {
        name,
        scope: 'COMPANY',
        category,
        employeeId: null,
        s3Key,
        fileName,
        fileSize,
        mimeType,
        uploadedById: session.userId,
      },
    })
    await createAuditLog({
      userId: session.userId,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'DOCUMENT',
      entityId: doc.id,
      details: { name, scope, category },
    })
    return { success: true, count: 1 }
  }

  // EMPLOYEE scope — create one row per target employee, all sharing s3Key
  const rows = employeeIds.map((employeeId) => ({
    name,
    scope: 'EMPLOYEE' as const,
    category,
    employeeId,
    s3Key,
    fileName,
    fileSize,
    mimeType,
    uploadedById: session.userId,
  }))

  const result = await db.document.createMany({ data: rows })

  await createAuditLog({
    userId: session.userId,
    action: 'DOCUMENT_UPLOADED',
    entityType: 'DOCUMENT',
    entityId: s3Key,
    details: { name, scope, category, employeeIds, count: result.count },
  })

  return { success: true, count: result.count }
}

// ============================================================
// getDocuments — flexible filtering for HR + employee views
// ============================================================

export type GetDocumentsParams = {
  scope?: 'COMPANY' | 'EMPLOYEE'
  employeeId?: string
  category?: DocumentCategory
  search?: string
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'mimeType'
  sortDir?: 'asc' | 'desc'
}

export async function getDocuments(params: GetDocumentsParams = {}): Promise<DocumentRecord[]> {
  const session = await verifySession()
  const isHR = isHRRole(session.role)
  const {
    scope,
    employeeId,
    category,
    search,
    sortBy = 'createdAt',
    sortDir = 'desc',
  } = params

  // Non-HR users can only see COMPANY-wide docs and their own EMPLOYEE docs.
  if (!isHR) {
    if (scope === 'EMPLOYEE' && employeeId && employeeId !== session.userId) {
      return []
    }
    if (scope === 'COMPANY') {
      // ok — allowed
    } else if (!scope) {
      // No scope filter, but non-HR: restrict to own docs + company.
      // We'll handle this by running two queries below.
    } else {
      // scope === EMPLOYEE, employeeId not set (or == self): fall through with self filter
    }
  }

  const where: Record<string, unknown> = {}
  if (scope) where.scope = scope
  if (category) where.category = category

  if (scope === 'EMPLOYEE') {
    where.employeeId = isHR ? employeeId ?? undefined : session.userId
  } else if (!scope && !isHR) {
    // Mixed view for employee: COMPANY OR own EMPLOYEE docs
    where.OR = [
      { scope: 'COMPANY' },
      { scope: 'EMPLOYEE', employeeId: session.userId },
    ]
  }

  if (search && search.trim()) {
    const term = search.trim()
    where.AND = [
      ...(Array.isArray(where.AND) ? (where.AND as object[]) : []),
      {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { fileName: { contains: term, mode: 'insensitive' } },
        ],
      },
    ]
  }

  const docs = await db.document.findMany({
    where,
    include: {
      uploadedBy: { select: { firstName: true, lastName: true } },
      employee: { select: { firstName: true, lastName: true } },
    },
    orderBy: { [sortBy]: sortDir },
  })

  return Promise.all(
    docs.map(async (doc) => {
      const downloadUrl = await getDownloadUrl(doc.s3Key)
      const canDelete = isHR || doc.uploadedById === session.userId
      return {
        id: doc.id,
        name: doc.name,
        scope: doc.scope as 'COMPANY' | 'EMPLOYEE',
        category: doc.category as DocumentCategory,
        employeeId: doc.employeeId,
        employee: doc.employee,
        s3Key: doc.s3Key,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        uploadedById: doc.uploadedById,
        uploadedBy: doc.uploadedBy,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        downloadUrl,
        canDelete,
      }
    })
  )
}

// ============================================================
// getMyDocuments — employee-facing summary view
// ============================================================

export async function getMyDocuments(): Promise<{
  companyDocs: DocumentRecord[]
  myDocs: DocumentRecord[]
}> {
  const session = await verifySession()
  const [companyDocs, myDocs] = await Promise.all([
    getDocuments({ scope: 'COMPANY' }),
    getDocuments({ scope: 'EMPLOYEE', employeeId: session.userId }),
  ])
  return { companyDocs, myDocs }
}

// ============================================================
// getEmployeeFolderSummary — HR browser left panel
// ============================================================

export type EmployeeFolderSummary = {
  employeeId: string
  firstName: string
  lastName: string
  docCount: number
  lastUpdated: string | null
}

export async function getEmployeeFolderSummary(): Promise<EmployeeFolderSummary[]> {
  await requireRole(['ADMIN', 'HR'])

  const employees = await db.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })

  const counts = await db.document.groupBy({
    by: ['employeeId'],
    where: { scope: 'EMPLOYEE' },
    _count: { _all: true },
    _max: { updatedAt: true },
  })
  const byId = new Map(
    counts.map((c) => [c.employeeId, { count: c._count._all, last: c._max.updatedAt }])
  )

  return employees.map((e) => {
    const m = byId.get(e.id)
    return {
      employeeId: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      docCount: m?.count ?? 0,
      lastUpdated: m?.last?.toISOString() ?? null,
    }
  })
}

// ============================================================
// deleteDocument — refcount-aware; permission-checked
// ============================================================

export async function deleteDocument(id: string): Promise<{ success: boolean; error?: string }> {
  const session = await verifySession()
  const isHR = isHRRole(session.role)

  const doc = await db.document.findUnique({ where: { id } })
  if (!doc) return { success: false, error: 'Not found' }

  // Permissions: HR can delete anything. Employees can only delete docs THEY uploaded.
  if (!isHR && doc.uploadedById !== session.userId) {
    return { success: false, error: 'Forbidden' }
  }

  // Count other rows sharing the same Drive file (mass-push case)
  const others = await db.document.count({
    where: { s3Key: doc.s3Key, id: { not: id } },
  })

  await db.document.delete({ where: { id } })

  if (others === 0) {
    try {
      await deleteFile(doc.s3Key)
    } catch (err) {
      console.error('Drive delete failed for', doc.s3Key, err)
    }
  }

  await createAuditLog({
    userId: session.userId,
    action: 'DOCUMENT_DELETED',
    entityType: 'DOCUMENT',
    entityId: id,
    details: {
      name: doc.name,
      scope: doc.scope,
      category: doc.category,
      employeeId: doc.employeeId,
      sharedRowsRemaining: others,
    },
  })

  return { success: true }
}
