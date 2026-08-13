import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { requireCapabilityApi, withApiAuth } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import { EXPENSE_CATEGORIES } from '@/lib/expense-constants'
import type { ExpenseStatus } from '@/generated/prisma/client'

const categoryMap = Object.fromEntries(
  EXPENSE_CATEGORIES.map(c => [c.value, c.label])
)

export async function GET(request: NextRequest) {
  return withApiAuth(() => handler(request))
}

async function handler(request: NextRequest) {
  const session = await requireCapabilityApi('expense.export')

  // Receipt links point back into the app rather than at drive.google.com, so
  // opening one from the spreadsheet goes through the authorization check.
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''

  const params = request.nextUrl.searchParams
  const employee = params.get('employee')?.trim() || ''
  const category = params.get('category') || ''
  const status = params.get('status') || ''
  const from = params.get('from') || ''
  const to = params.get('to') || ''


  const where: Record<string, any> = {}

  if (status) {
    where.status = status as ExpenseStatus
  }

  if (category) {
    where.category = category
  }

  if (employee) {
    where.user = {
      OR: [
        { firstName: { contains: employee, mode: 'insensitive' } },
        { lastName: { contains: employee, mode: 'insensitive' } },
      ],
    }
  }

  if (from || to) {
    where.receiptDate = {} as Record<string, Date>
    if (from) where.receiptDate.gte = new Date(from)
    if (to) where.receiptDate.lte = new Date(`${to}T23:59:59.999Z`)
  }

  const expenses = await db.expense.findMany({
    where,
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      approver: { select: { firstName: true, lastName: true } },
      receipts: { select: { blobId: true, fileName: true } },
    },
    orderBy: [
      { user: { firstName: 'asc' } },
      { receiptDate: 'asc' },
    ],
  })

  if (expenses.length === 0) {
    return NextResponse.json({ error: 'No expenses found matching filters' }, { status: 404 })
  }

  // ---------- Line Items sheet ----------
  const lineItems = expenses.map(e => ({
    Employee: `${e.user.firstName} ${e.user.lastName}`,
    Email: e.user.email,
    Category: categoryMap[e.category] ?? e.category,
    Merchant: e.merchant,
    'Receipt Date': e.receiptDate.toISOString().split('T')[0],
    Description: e.description ?? '',
    Currency: e.currency,
    Amount: parseFloat(e.amount.toString()),
    Status: e.status,
    'Approved By': e.approver ? `${e.approver.firstName} ${e.approver.lastName}` : '',
    Receipts: e.receipts
      .map(r => (r.blobId ? `${baseUrl}/api/files/${r.blobId}` : r.fileName))
      .join('\n'),
  }))

  // ---------- Summary sheet (grouped by employee + currency) ----------
  const summaryMap = new Map<string, {
    employee: string
    email: string
    currency: string
    totalAmount: number
    itemCount: number
  }>()

  const summaryStatuses = new Set(['FOR_APPROVAL', 'APPROVED', 'REIMBURSED'])

  for (const e of expenses) {
    if (!summaryStatuses.has(e.status)) continue
    const name = `${e.user.firstName} ${e.user.lastName}`
    const key = `${e.userId}|${e.currency}`
    const existing = summaryMap.get(key)
    if (existing) {
      existing.totalAmount += parseFloat(e.amount.toString())
      existing.itemCount += 1
    } else {
      summaryMap.set(key, {
        employee: name,
        email: e.user.email,
        currency: e.currency,
        totalAmount: parseFloat(e.amount.toString()),
        itemCount: 1,
      })
    }
  }

  const summary = Array.from(summaryMap.values())
    .sort((a, b) => a.employee.localeCompare(b.employee))
    .map(s => ({
      Employee: s.employee,
      Email: s.email,
      Currency: s.currency,
      'Total Amount': s.totalAmount,
      'No. of Claims': s.itemCount,
    }))

  // ---------- Build workbook ----------
  const wb = XLSX.utils.book_new()

  const summaryWs = XLSX.utils.json_to_sheet(summary)
  summaryWs['!cols'] = [
    { wch: 25 },
    { wch: 30 },
    { wch: 10 },
    { wch: 15 },
    { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

  const detailWs = XLSX.utils.json_to_sheet(lineItems)
  detailWs['!cols'] = [
    { wch: 25 },
    { wch: 30 },
    { wch: 20 },
    { wch: 25 },
    { wch: 14 },
    { wch: 30 },
    { wch: 10 },
    { wch: 15 },
    { wch: 14 },
    { wch: 20 },
    { wch: 60 },
  ]
  XLSX.utils.book_append_sheet(wb, detailWs, 'Line Items')

  // ---------- Generate buffer ----------
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  await createAuditLog({
    userId: session.userId,
    action: 'EXPENSE_EXPORTED',
    entityType: 'EXPENSE',
    details: {
      kind: 'filtered',
      // The filters matter: with none set this is a full-company dump, which
      // should look different in the audit log from a single-employee export.
      filters: { employee, category, status, from, to },
      claimCount: expenses.length,
      includesEmails: true,
      includesReceiptLinks: true,
    },
  })

  const today = new Date().toISOString().split('T')[0]
  const filename = `Expenses_Export_${today}.xlsx`

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
