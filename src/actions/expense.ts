'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { verifySession, requireCapability } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { notify } from '@/lib/notify'
import { getSetting } from '@/lib/settings'
import { assertNotSelf, SelfApprovalError } from '@/lib/approvers'
import { createAuditLog } from '@/lib/audit'
import { getExpenseApprover } from '@/lib/expenses'
import { storage } from '@/lib/storage'

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
    const toDelete = existing.receipts.filter(r => !newKeys.has(r.blobId ?? '')).map(r => r.id)
    const blobsToRelease = existing.receipts
      .filter(r => !newKeys.has(r.blobId ?? ''))
      .map(r => r.blobId)
      .filter((b): b is string => !!b)

    // Find receipts to add (those not already in DB)
    const existingKeys = new Set(existing.receipts.map(r => r.blobId))
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
                blobId: r.key,
                fileName: r.fileName,
                fileSize: r.fileSize,
                mimeType: r.mimeType,
                uploadedById: session.userId,
              })),
            }),
          ]
        : []),
    ])

    // Removed receipts give up their blob reference; the bytes go when the last
    // reference does.
    for (const blobId of blobsToRelease) {
      await storage.release(blobId)
    }

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
          blobId: r.key,
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

  const submitter = await db.user.findUnique({
    where: { id: session.userId },
    select: { firstName: true, lastName: true },
  })
  await notify({
    userId: approverId,
    type: 'EXPENSE_SUBMITTED',
    title: `Expense claim from ${submitter?.firstName} ${submitter?.lastName}`,
    body: `${expense.currency} ${Number(expense.amount).toFixed(2)} — ${expense.merchant}. Waiting for your approval.`,
    linkUrl: '/expenses/approvals',
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

  if (session.userId !== expense.approverId && !can(session.role, 'expense.admin')) {
    return { error: 'You are not authorised to approve this expense' }
  }

  // An admin could previously approve *and* reimburse their own claim end to
  // end, with no second pair of eyes anywhere in the chain.
  try {
    await assertNotSelf(session.userId, expense.userId, 'expense claim')
  } catch (err) {
    if (err instanceof SelfApprovalError) return { error: err.message }
    throw err
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

  await notify({
    userId: expense.userId,
    type: 'EXPENSE_APPROVED',
    title: 'Your expense claim was approved',
    body: `${expense.currency} ${Number(expense.amount).toFixed(2)} — ${expense.merchant}${comment ? ` — "${comment}"` : ''}. Awaiting reimbursement.`,
    linkUrl: '/expenses',
  })

  // Receipts used to be physically moved between Drive folders as the claim
  // progressed (Pending Approval → Approved → Reimbursed), which kept a second,
  // divergent copy of the claim's status. The claim's own `status` column is now
  // the only place status lives, so there is nothing to move.

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

  if (session.userId !== expense.approverId && !can(session.role, 'expense.admin')) {
    return { error: 'You are not authorised to reject this expense' }
  }

  try {
    await assertNotSelf(session.userId, expense.userId, 'expense claim')
  } catch (err) {
    if (err instanceof SelfApprovalError) return { error: err.message }
    throw err
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

  await notify({
    userId: expense.userId,
    type: 'EXPENSE_REJECTED',
    title: 'Your expense claim was declined',
    body: `${expense.currency} ${Number(expense.amount).toFixed(2)} — ${expense.merchant}${comment ? ` — reason: "${comment}"` : ''}`,
    linkUrl: '/expenses',
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
  const session = await requireCapability('expense.reimburse')

  const expenseId = formData.get('expenseId') as string
  if (!expenseId) return { error: 'Expense ID is required' }

  const expense = await db.expense.findUniqueOrThrow({
    where: { id: expenseId },
  })

  if (expense.status !== 'APPROVED') {
    return { error: `Cannot reimburse a ${expense.status.toLowerCase()} expense` }
  }

  // Releasing money to yourself needs someone else to press the button.
  try {
    await assertNotSelf(session.userId, expense.userId, 'expense claim')
  } catch (err) {
    if (err instanceof SelfApprovalError) return { error: err.message }
    throw err
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

  await notify({
    userId: expense.userId,
    type: 'EXPENSE_REIMBURSED',
    title: 'Your expense claim was reimbursed',
    body: `${expense.currency} ${Number(expense.amount).toFixed(2)} — ${expense.merchant}`,
    linkUrl: '/expenses',
  })

  // No folder move needed — see the note in approveExpense.

  return { success: true }
}

// ============================================================
// bulkReimburse — mark multiple approved expenses as reimbursed
// ============================================================

export async function bulkReimburse(expenseIds: string[]): Promise<{ success: boolean; count: number; error?: string }> {
  const session = await requireCapability('expense.reimburse')

  if (!expenseIds || expenseIds.length === 0) {
    return { success: false, count: 0, error: 'No expenses selected' }
  }

  // Verify all are APPROVED. Bulk reimburse must not be a route around the
  // self-approval rule, so the caller's own claims are excluded.
  const blockSelf = await getSetting('approvals.blockSelfApproval')
  const expenses = await db.expense.findMany({
    where: {
      id: { in: expenseIds },
      status: 'APPROVED',
      ...(blockSelf ? { userId: { not: session.userId } } : {}),
    },
    include: { receipts: { select: { blobId: true } } },
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

    await notify({
      userId: expense.userId,
      type: 'EXPENSE_REIMBURSED',
      title: 'Your expense claim was reimbursed',
      body: `${expense.currency} ${Number(expense.amount).toFixed(2)} — ${expense.merchant}`,
      linkUrl: '/expenses',
    })
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

  // The blob route does its own authorization and audit logging when hit, so
  // building a link here costs nothing and grants nothing.
  const receiptsWithUrls = expense.receipts.map(receipt => ({
    ...receipt,
    downloadUrl: receipt.blobId ? `/api/files/${receipt.blobId}` : '',
  }))

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
      receipts: { select: { id: true, blobId: true, fileName: true, mimeType: true } },
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
          url: receipt.blobId ? `/api/files/${receipt.blobId}` : '',
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
  await requireCapability('expense.reimburse')

  const expenses = await db.expense.findMany({
    where: { status: 'APPROVED' },
    include: {
      user: { select: { firstName: true, lastName: true } },
      receipts: { select: { id: true, blobId: true, fileName: true, mimeType: true } },
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
          url: receipt.blobId ? `/api/files/${receipt.blobId}` : '',
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
      receipts: { select: { id: true, blobId: true, fileName: true, mimeType: true } },
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
          url: receipt.blobId ? `/api/files/${receipt.blobId}` : '',
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
    const session = await requireCapability('expense.delete')

    const expense = await db.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: {
        receipts: { select: { blobId: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    })

    const receiptBlobIds = expense.receipts
      .map(r => r.blobId)
      .filter((b): b is string => !!b)

    // Delete in correct order: approvals → receipts → expense
    await db.$transaction([
      db.expenseApproval.deleteMany({ where: { expenseId } }),
      db.expenseReceipt.deleteMany({ where: { expenseId } }),
      db.expense.delete({ where: { id: expenseId } }),
    ])

    // Rows are gone, so release their blob references. Note this still destroys
    // the receipts backing what may have been a *paid* claim — see the open item
    // in oversight.md §6 about offering hard delete in every state.
    for (const blobId of receiptBlobIds) {
      await storage.release(blobId)
    }

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
