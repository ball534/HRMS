'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { verifySession, requireRole } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import { getExpenseApprover } from '@/lib/expenses'
import { getDownloadUrl, moveFile, getExpenseFolderPath } from '@/lib/google-drive'

// ============================================================
// Types
// ============================================================

export type ExpenseActionState = {
  success?: boolean
  error?: string
  expenseId?: string
}

type UploadedReceipt = {
  key: string
  fileName: string
  fileSize: number
  mimeType: string
}

// ============================================================
// Zod schema
// ============================================================

const expenseSchema = z.object({
  category: z.enum([
    'LOCAL_TRANSPORT',
    'SUBSCRIPTIONS',
    'OFFICE_EXPENSES',
    'MEALS_ENTERTAINMENT',
    'MEDICAL',
    'COMMUNICATION',
    'TRAVEL',
    'TRAINING',
    'OTHERS',
  ]),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  currency: z.enum([
    'SGD',
    'USD',
    'EUR',
    'IDR',
    'KRW',
    'INR',
    'HKD',
    'VND',
    'MYR',
    'THB',
    'PHP',
    'JPY',
    'CNY',
  ]),
  merchant: z.string().min(1, 'Merchant name is required'),
  receiptDate: z.string().min(1, 'Receipt date is required'),
  description: z.string().optional(),
})

// ============================================================
// saveExpenseDraft
// ============================================================

async function saveExpenseDraft(
  _state: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const session = await verifySession()

  const raw = {
    category: formData.get('category') as string,
    amount: formData.get('amount') as string,
    currency: formData.get('currency') as string,
    merchant: formData.get('merchant') as string,
    receiptDate: formData.get('receiptDate') as string,
    description: (formData.get('description') as string) || undefined,
  }

  const parsed = expenseSchema.safeParse(raw)
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0]
    return { error: firstError ?? 'Invalid form data' }
  }

  const { category, amount, currency, merchant, receiptDate, description } = parsed.data

  // Parse uploaded receipt metadata (Google Drive file IDs)
  let receipts: UploadedReceipt[] = []
  const receiptsJson = formData.get('receipts') as string | null
  if (receiptsJson) {
    try {
      receipts = JSON.parse(receiptsJson) as UploadedReceipt[]
    } catch {
      return { error: 'Invalid receipt data' }
    }
  }

  const existingExpenseId = formData.get('expenseId') as string | null

  if (existingExpenseId) {
    // Update existing draft
    const existing = await db.expense.findUniqueOrThrow({
      where: { id: existingExpenseId },
      include: { receipts: true },
    })

    if (existing.userId !== session.userId) {
      return { error: 'Not authorised to edit this expense' }
    }

    if (existing.status !== 'DRAFT') {
      return { error: 'Only DRAFT expenses can be edited' }
    }

    // Find receipts to remove (those not in the new list)
    const newKeys = new Set(receipts.map(r => r.key))
    const toDelete = existing.receipts.filter(r => !newKeys.has(r.s3Key)).map(r => r.id)

    // Find receipts to add (those not already in DB)
    const existingKeys = new Set(existing.receipts.map(r => r.s3Key))
    const toAdd = receipts.filter(r => !existingKeys.has(r.key))

    await db.$transaction([
      db.expense.update({
        where: { id: existingExpenseId },
        data: {
          category,
          amount,
          currency,
          merchant,
          receiptDate: new Date(receiptDate),
          description,
        },
      }),
      ...(toDelete.length > 0
        ? [db.expenseReceipt.deleteMany({ where: { id: { in: toDelete } } })]
        : []),
      ...(toAdd.length > 0
        ? [
            db.expenseReceipt.createMany({
              data: toAdd.map(r => ({
                expenseId: existingExpenseId,
                s3Key: r.key,
                fileName: r.fileName,
                fileSize: r.fileSize,
                mimeType: r.mimeType,
                uploadedById: session.userId,
              })),
            }),
          ]
        : []),
    ])

    return { success: true, expenseId: existingExpenseId }
  }

  // Create new draft
  const expense = await db.expense.create({
    data: {
      userId: session.userId,
      category,
      amount,
      currency,
      merchant,
      receiptDate: new Date(receiptDate),
      description,
      status: 'DRAFT',
      receipts: {
        create: receipts.map(r => ({
          s3Key: r.key,
          fileName: r.fileName,
          fileSize: r.fileSize,
          mimeType: r.mimeType,
          uploadedById: session.userId,
        })),
      },
    },
  })

  return { success: true, expenseId: expense.id }
}

// ============================================================
// submitExpense
// ============================================================

async function submitExpense(
  _state: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const session = await verifySession()

  const expenseId = formData.get('expenseId') as string | null

  // If expense fields are provided, save/update first then submit
  const hasExpenseFields = formData.get('category') !== null

  let targetExpenseId: string

  if (hasExpenseFields) {
    const saveResult = await saveExpenseDraft(_state, formData)
    if (saveResult.error) return saveResult
    targetExpenseId = saveResult.expenseId!
  } else {
    if (!expenseId) return { error: 'Expense ID is required' }
    targetExpenseId = expenseId
  }

  const expense = await db.expense.findUniqueOrThrow({
    where: { id: targetExpenseId },
  })

  if (expense.userId !== session.userId) {
    return { error: 'Not authorised to submit this expense' }
  }

  if (expense.status !== 'DRAFT') {
    return { error: `Cannot submit a ${expense.status.toLowerCase()} expense` }
  }

  const approverId = await getExpenseApprover(session.userId)

  await db.$transaction([
    db.expense.update({
      where: { id: targetExpenseId },
      data: {
        status: 'FOR_APPROVAL',
        approverId,
        submittedAt: new Date(),
      },
    }),
    db.expenseApproval.create({
      data: {
        expenseId: targetExpenseId,
        approverId,
        status: 'PENDING',
        order: 1,
      },
    }),
  ])

  await createAuditLog({
    userId: session.userId,
    action: 'EXPENSE_SUBMITTED',
    entityType: 'EXPENSE',
    entityId: targetExpenseId,
    details: { approverId },
  })

  return { success: true, expenseId: targetExpenseId }
}

// ============================================================
// approveExpense
// ============================================================

export async function approveExpense(
  _state: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const session = await verifySession()

  const expenseId = formData.get('expenseId') as string
  const comment = (formData.get('comment') as string) || undefined

  if (!expenseId) return { error: 'Expense ID is required' }

  const expense = await db.expense.findUniqueOrThrow({
    where: { id: expenseId },
  })

  if (session.userId !== expense.approverId && session.role !== 'ADMIN') {
    return { error: 'You are not authorised to approve this expense' }
  }

  if (expense.status !== 'FOR_APPROVAL') {
    return { error: `Cannot approve a ${expense.status.toLowerCase()} expense` }
  }

  const pendingApproval = await db.expenseApproval.findFirst({
    where: { expenseId, status: 'PENDING' },
    orderBy: { order: 'asc' },
  })

  await db.$transaction([
    db.expense.update({
      where: { id: expenseId },
      data: { status: 'APPROVED', approverId: session.userId },
    }),
    ...(pendingApproval
      ? [
          db.expenseApproval.update({
            where: { id: pendingApproval.id },
            data: { status: 'APPROVED', actedAt: new Date(), comment },
          }),
        ]
      : []),
  ])

  await createAuditLog({
    userId: session.userId,
    action: 'EXPENSE_APPROVED',
    entityType: 'EXPENSE',
    entityId: expenseId,
    details: { comment },
  })

  // Move receipts from Pending Approval → Approved/YYYY-MM (by approval date)
  const receipts = await db.expenseReceipt.findMany({
    where: { expenseId },
    select: { s3Key: true },
  })
  const approvalFolder = getExpenseFolderPath('APPROVED', new Date())
  for (const receipt of receipts) {
    try {
      await moveFile(receipt.s3Key, approvalFolder)
    } catch {
      // Non-critical: file may have been uploaded before Drive migration
    }
  }

  return { success: true }
}

// ============================================================
// rejectExpense
// ============================================================

export async function rejectExpense(
  _state: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const session = await verifySession()

  const expenseId = formData.get('expenseId') as string
  const comment = (formData.get('comment') as string) || undefined

  if (!expenseId) return { error: 'Expense ID is required' }

  const expense = await db.expense.findUniqueOrThrow({
    where: { id: expenseId },
  })

  if (session.userId !== expense.approverId && session.role !== 'ADMIN') {
    return { error: 'You are not authorised to reject this expense' }
  }

  if (expense.status !== 'FOR_APPROVAL') {
    return { error: `Cannot reject a ${expense.status.toLowerCase()} expense` }
  }

  const pendingApproval = await db.expenseApproval.findFirst({
    where: { expenseId, status: 'PENDING' },
    orderBy: { order: 'asc' },
  })

  await db.$transaction([
    db.expense.update({
      where: { id: expenseId },
      data: { status: 'REJECTED', approverId: session.userId },
    }),
    ...(pendingApproval
      ? [
          db.expenseApproval.update({
            where: { id: pendingApproval.id },
            data: { status: 'REJECTED', actedAt: new Date(), comment },
          }),
        ]
      : []),
  ])

  await createAuditLog({
    userId: session.userId,
    action: 'EXPENSE_REJECTED',
    entityType: 'EXPENSE',
    entityId: expenseId,
    details: { comment },
  })

  return { success: true }
}

// ============================================================
// markReimbursed
// ============================================================

export async function markReimbursed(
  _state: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const session = await requireRole(['ADMIN'])

  const expenseId = formData.get('expenseId') as string
  if (!expenseId) return { error: 'Expense ID is required' }

  const expense = await db.expense.findUniqueOrThrow({
    where: { id: expenseId },
  })

  if (expense.status !== 'APPROVED') {
    return { error: `Cannot reimburse a ${expense.status.toLowerCase()} expense` }
  }

  await db.expense.update({
    where: { id: expenseId },
    data: {
      status: 'REIMBURSED',
      reimbursedAt: new Date(),
      reimbursedById: session.userId,
    },
  })

  await createAuditLog({
    userId: session.userId,
    action: 'EXPENSE_REIMBURSED',
    entityType: 'EXPENSE',
    entityId: expenseId,
    details: {},
  })

  // Move receipts from Approved → Reimbursed/YYYY-MM (by reimbursement date)
  const receipts = await db.expenseReceipt.findMany({
    where: { expenseId },
    select: { s3Key: true },
  })
  const reimbursedFolder = getExpenseFolderPath('REIMBURSED', new Date())
  for (const receipt of receipts) {
    try {
      await moveFile(receipt.s3Key, reimbursedFolder)
    } catch {
      // Non-critical: file may have been uploaded before Drive migration
    }
  }

  return { success: true }
}

// ============================================================
// bulkReimburse — mark multiple approved expenses as reimbursed
// ============================================================

export async function bulkReimburse(expenseIds: string[]): Promise<{ success: boolean; count: number; error?: string }> {
  const session = await requireRole(['ADMIN'])

  if (!expenseIds || expenseIds.length === 0) {
    return { success: false, count: 0, error: 'No expenses selected' }
  }

  // Verify all are APPROVED
  const expenses = await db.expense.findMany({
    where: { id: { in: expenseIds }, status: 'APPROVED' },
    include: { receipts: { select: { s3Key: true } } },
  })

  if (expenses.length === 0) {
    return { success: false, count: 0, error: 'No approved expenses found in selection' }
  }

  const now = new Date()

  // Update all to REIMBURSED
  await db.expense.updateMany({
    where: { id: { in: expenses.map(e => e.id) } },
    data: {
      status: 'REIMBURSED',
      reimbursedAt: now,
      reimbursedById: session.userId,
    },
  })

  // Audit log for each
  for (const expense of expenses) {
    await createAuditLog({
      userId: session.userId,
      action: 'EXPENSE_REIMBURSED',
      entityType: 'EXPENSE',
      entityId: expense.id,
      details: { bulk: true },
    })

    // Move receipts to Reimbursed folder
    const reimbursedFolder = getExpenseFolderPath('REIMBURSED', now)
    for (const receipt of expense.receipts) {
      try {
        await moveFile(receipt.s3Key, reimbursedFolder)
      } catch {
        // Non-critical
      }
    }
  }

  return { success: true, count: expenses.length }
}

// ============================================================
// getExpenses — async fetch, not a form action
// ============================================================

export type ExpenseFilters = {
  userId?: string
  category?: string
  status?: string
  from?: string
  to?: string
}

export async function getExpenses(filters?: ExpenseFilters) {
  const session = await verifySession()

  // Determine target userId
  // Non-admins can only see their own expenses
  let targetUserId: string | undefined
  if (session.role === 'ADMIN') {
    targetUserId = filters?.userId
  } else {
    targetUserId = session.userId
  }

  const whereClause: Record<string, unknown> = {}
  if (targetUserId) whereClause.userId = targetUserId
  if (filters?.category) whereClause.category = filters.category
  if (filters?.status) whereClause.status = filters.status
  if (filters?.from || filters?.to) {
    whereClause.receiptDate = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    }
  }

  const expenses = await db.expense.findMany({
    where: whereClause,
    include: {
      user: { select: { firstName: true, lastName: true } },
      receipts: true,
      approver: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Convert Prisma.Decimal amount to string for serialization across server/client boundary
  return expenses.map(expense => ({
    ...expense,
    amount: expense.amount.toString(),
  }))
}

// ============================================================
// getExpenseDetail
// ============================================================

export async function getExpenseDetail(expenseId: string) {
  const session = await verifySession()

  const expense = await db.expense.findUniqueOrThrow({
    where: { id: expenseId },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      receipts: {
        include: {
          uploadedBy: { select: { firstName: true, lastName: true } },
        },
      },
      approvals: {
        include: {
          approver: { select: { firstName: true, lastName: true } },
        },
        orderBy: { order: 'asc' },
      },
      approver: { select: { firstName: true, lastName: true } },
      reimbursedBy: { select: { firstName: true, lastName: true } },
    },
  })

  // Auth check: own expense, assigned approver, or admin
  const isAuthorised =
    session.userId === expense.userId ||
    session.userId === expense.approverId ||
    session.role === 'ADMIN'

  if (!isAuthorised) {
    return null
  }

  // Generate presigned download URLs for each receipt
  const receiptsWithUrls = await Promise.all(
    expense.receipts.map(async receipt => ({
      ...receipt,
      downloadUrl: await getDownloadUrl(receipt.s3Key),
    }))
  )

  return {
    ...expense,
    amount: expense.amount.toString(),
    receipts: receiptsWithUrls,
  }
}

// ============================================================
// handleExpenseAction — intent-based dispatch for ExpenseForm
// ============================================================
// Reads 'intent' from formData: 'draft' | 'submit'
// Called via useActionState in ExpenseForm with a single action.

export async function handleExpenseAction(
  _state: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const intent = formData.get('intent') as string

  if (intent === 'submit') {
    return submitExpense(_state, formData)
  }

  // Default: save as draft
  return saveExpenseDraft(_state, formData)
}

// ============================================================
// getApprovalExpenses — fetch expenses for approval/all tabs
// ============================================================

export type ApprovalExpenseFilters = {
  employee?: string   // search by first/last name
  category?: string
  status?: string
  dateFrom?: string
  dateTo?: string
}

export async function getApprovalExpenses(filters?: ApprovalExpenseFilters) {
  const session = await verifySession()

  // Build where clause

  const where: Record<string, any> = {
    status: { in: ['FOR_APPROVAL', 'APPROVED', 'REJECTED', 'REIMBURSED'] },
  }

  // Non-admins can only see expenses assigned to them as approver
  if (session.role !== 'ADMIN') {
    where.approverId = session.userId
  }

  // Category filter
  if (filters?.category) where.category = filters.category

  // Status filter (override the default 'in' filter if specific status provided)
  if (filters?.status) where.status = filters.status

  // Date range filter
  if (filters?.dateFrom || filters?.dateTo) {
    where.receiptDate = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    }
  }

  // Employee name search
  if (filters?.employee) {
    const parts = filters.employee.trim().split(/\s+/)
    if (parts.length >= 2) {
      where.user = {
        firstName: { contains: parts[0], mode: 'insensitive' },
        lastName: { contains: parts[1], mode: 'insensitive' },
      }
    } else {
      where.user = {
        OR: [
          { firstName: { contains: filters.employee, mode: 'insensitive' } },
          { lastName: { contains: filters.employee, mode: 'insensitive' } },
        ],
      }
    }
  }

  const expenses = await db.expense.findMany({
    where,
    include: {
      user: { select: { firstName: true, lastName: true } },
      receipts: { select: { id: true, s3Key: true, fileName: true, mimeType: true } },
      approvals: {
        include: {
          approver: { select: { firstName: true, lastName: true } },
        },
        orderBy: { order: 'asc' },
      },
      approver: { select: { firstName: true, lastName: true } },
      reimbursedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { submittedAt: 'desc' },
  })

  // Generate presigned URLs for receipts
  const expensesWithUrls = await Promise.all(
    expenses.map(async expense => ({
      ...expense,
      amount: expense.amount.toString(),
      receipts: await Promise.all(
        expense.receipts.map(async receipt => ({
          ...receipt,
          url: await getDownloadUrl(receipt.s3Key),
        }))
      ),
    }))
  )

  return expensesWithUrls
}

// ============================================================
// getReimbursableExpenses — approved expenses awaiting reimbursement
// ============================================================

export async function getReimbursableExpenses() {
  await requireRole(['ADMIN'])

  const expenses = await db.expense.findMany({
    where: { status: 'APPROVED' },
    include: {
      user: { select: { firstName: true, lastName: true } },
      receipts: { select: { id: true, s3Key: true, fileName: true, mimeType: true } },
      approvals: {
        include: {
          approver: { select: { firstName: true, lastName: true } },
        },
        orderBy: { order: 'asc' },
      },
      approver: { select: { firstName: true, lastName: true } },
      reimbursedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { updatedAt: 'asc' },
  })

  const expensesWithUrls = await Promise.all(
    expenses.map(async expense => ({
      ...expense,
      amount: expense.amount.toString(),
      receipts: await Promise.all(
        expense.receipts.map(async receipt => ({
          ...receipt,
          url: await getDownloadUrl(receipt.s3Key),
        }))
      ),
    }))
  )

  return expensesWithUrls
}

// ============================================================
// getPendingExpenseApprovals
// ============================================================

export async function getPendingExpenseApprovals() {
  const session = await verifySession()

  // Admins see all pending approvals; non-admins only see their own
  const where: Record<string, unknown> = { status: 'FOR_APPROVAL' }
  if (session.role !== 'ADMIN') {
    where.approverId = session.userId
  }

  const expenses = await db.expense.findMany({
    where,
    include: {
      user: { select: { firstName: true, lastName: true } },
      receipts: { select: { id: true, s3Key: true, fileName: true, mimeType: true } },
      approvals: {
        include: {
          approver: { select: { firstName: true, lastName: true } },
        },
        orderBy: { order: 'asc' },
      },
      approver: { select: { firstName: true, lastName: true } },
      reimbursedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { submittedAt: 'asc' },
  })

  const expensesWithUrls = await Promise.all(
    expenses.map(async expense => ({
      ...expense,
      amount: expense.amount.toString(),
      receipts: await Promise.all(
        expense.receipts.map(async receipt => ({
          ...receipt,
          url: await getDownloadUrl(receipt.s3Key),
        }))
      ),
    }))
  )

  return expensesWithUrls
}

// ============================================================
// deleteExpense — admin-only hard delete
// ============================================================

export async function deleteExpense(expenseId: string): Promise<ExpenseActionState> {
  try {
    const session = await requireRole(['ADMIN'])

    const expense = await db.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: {
        receipts: { select: { s3Key: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    })

    // Delete receipt files from Google Drive
    const { deleteFile } = await import('@/lib/google-drive')
    for (const receipt of expense.receipts) {
      try {
        await deleteFile(receipt.s3Key)
      } catch (err) {
        console.error(`Failed to delete file ${receipt.s3Key} from Google Drive:`, err)
      }
    }

    // Delete in correct order: approvals → receipts → expense
    await db.$transaction([
      db.expenseApproval.deleteMany({ where: { expenseId } }),
      db.expenseReceipt.deleteMany({ where: { expenseId } }),
      db.expense.delete({ where: { id: expenseId } }),
    ])

    await createAuditLog({
      userId: session.userId,
      action: 'EXPENSE_DELETED',
      entityType: 'EXPENSE',
      entityId: expenseId,
      details: {
        employee: `${expense.user.firstName} ${expense.user.lastName}`,
        category: expense.category,
        amount: expense.amount.toString(),
        currency: expense.currency,
        merchant: expense.merchant,
        previousStatus: expense.status,
      },
    })

    return { success: true }
  } catch (err) {
    console.error('deleteExpense error:', err)
    return { error: 'Failed to delete expense.' }
  }
}
