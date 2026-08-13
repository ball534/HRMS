import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { requireCapabilityApi, withApiAuth } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import { EXPENSE_CATEGORIES } from '@/lib/expense-constants'

const categoryMap = Object.fromEntries(
  EXPENSE_CATEGORIES.map(c => [c.value, c.label])
)

export async function GET() {
  return withApiAuth(() => handler())
}

async function handler() {
  // Dumps every APPROVED claim with employee emails and receipt links. Logged
  // so there is a record of who pulled the bank file and when.
  const session = await requireCapabilityApi('expense.export')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://insidehr-production.up.railway.app'

  const expenses = await db.expense.findMany({
    where: { status: 'APPROVED' },
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
    return NextResponse.json({ error: 'No approved expenses to export' }, { status: 404 })
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

  for (const e of expenses) {
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
    { wch: 25 }, // Employee
    { wch: 30 }, // Email
    { wch: 10 }, // Currency
    { wch: 15 }, // Total Amount
    { wch: 14 }, // No. of Claims
  ]
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

  const detailWs = XLSX.utils.json_to_sheet(lineItems)
  detailWs['!cols'] = [
    { wch: 25 }, // Employee
    { wch: 30 }, // Email
    { wch: 20 }, // Category
    { wch: 25 }, // Merchant
    { wch: 14 }, // Receipt Date
    { wch: 30 }, // Description
    { wch: 10 }, // Currency
    { wch: 15 }, // Amount
    { wch: 20 }, // Approved By
    { wch: 60 }, // Receipts
  ]
  XLSX.utils.book_append_sheet(wb, detailWs, 'Line Items')

  // ---------- Generate buffer ----------
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  await createAuditLog({
    userId: session.userId,
    action: 'EXPENSE_EXPORTED',
    entityType: 'EXPENSE',
    details: {
      kind: 'reimbursement_run',
      claimCount: expenses.length,
      totalsByCurrency: expenses.reduce<Record<string, number>>((acc, e) => {
        acc[e.currency] = (acc[e.currency] ?? 0) + Number(e.amount)
        return acc
      }, {}),
      includesEmails: true,
      includesReceiptLinks: true,
    },
  })

  const today = new Date().toISOString().split('T')[0]
  const filename = `Reimbursement_Export_${today}.xlsx`

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
