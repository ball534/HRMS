'use server'

import { db } from '@/lib/db'
import { verifySession, requireCapability } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import { storage } from '@/lib/storage'

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
  /** Blob id in FileBlob. Null only on legacy rows that predate Postgres storage. */
  blobId: string | null
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
  /** Blob id returned by the upload route, which has already stored the bytes. */
  blobId: string
  fileName: string
  fileSize: number
  mimeType: string
}): Promise<{ success: boolean; count?: number; error?: string }> {
  const session = await verifySession()
  const { name, scope, category, employeeIds = [], blobId, fileName, fileSize, mimeType } = data

  if (!name || !blobId || !fileName || !fileSize || !mimeType || !scope || !category) {
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
        blobId,
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

  // EMPLOYEE scope — one row per target employee, all pointing at the same blob.
  //
  // The upload route's `put` took the first reference; each *additional* row
  // needs its own. Previously N employees shared one physical Drive file with no
  // accounting at all, so one of them deleting "their" copy could bin the shared
  // original for everybody.
  const rows = employeeIds.map((employeeId) => ({
    name,
    scope: 'EMPLOYEE' as const,
    category,
    employeeId,
    blobId,
    fileName,
    fileSize,
    mimeType,
    uploadedById: session.userId,
  }))

  const result = await db.document.createMany({ data: rows })

  for (let i = 1; i < result.count; i++) {
    await storage.addRef(blobId)
  }

  await createAuditLog({
    userId: session.userId,
    action: 'DOCUMENT_UPLOADED',
    entityType: 'DOCUMENT',
    entityId: blobId,
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

  // No per-file round trip any more: the download URL is just the blob route,
  // which does its own authorization and audit logging when it is actually hit.
  return docs.map((doc) => {
      const downloadUrl = doc.blobId ? `/api/files/${doc.blobId}` : ''
      const canDelete = isHR || doc.uploadedById === session.userId
      return {
        id: doc.id,
        name: doc.name,
        scope: doc.scope as 'COMPANY' | 'EMPLOYEE',
        category: doc.category as DocumentCategory,
        employeeId: doc.employeeId,
        employee: doc.employee,
        blobId: doc.blobId,
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
}

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
  await requireCapability('documents.admin')

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

  await db.document.delete({ where: { id } })

  // Give up this row's reference. The bytes go only when the last one does, so
  // deleting your copy of a mass-pushed document no longer affects anyone else.
  if (doc.blobId) {
    await storage.release(doc.blobId)
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
      blobId: doc.blobId,
    },
  })

  return { success: true }
}
