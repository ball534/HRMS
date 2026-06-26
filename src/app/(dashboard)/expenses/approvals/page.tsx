import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { getPendingExpenseApprovals, getReimbursableExpenses, getApprovalExpenses } from '@/actions/expense'
import { ApprovalsClient } from './ApprovalsClient'

type SearchParams = Promise<{
  tab?: string
  employee?: string
  category?: string
  status?: string
  from?: string
  to?: string
}>

// Serialized expense type (Dates converted to strings for client component)
export type SerializedApprovalExpense = {
  id: string
  category: string
  amount: string
  currency: string
  merchant: string
  receiptDate: string
  description: string | null
  status: string
  submittedAt: string | null
  createdAt: string
  updatedAt: string
  reimbursedAt: string | null
  user: { firstName: string; lastName: string }
  approver: { firstName: string; lastName: string } | null
  reimbursedBy: { firstName: string; lastName: string } | null
  receipts: Array<{ id: string; s3Key: string; url: string; fileName: string; mimeType: string }>
  approvals: Array<{
    id: string
    status: string
    comment: string | null
    actedAt: string | null
    approver: { firstName: string; lastName: string }
  }>
}

function serializeExpense(e: {
  id: string
  category: string
  amount: string
  currency: string
  merchant: string
  receiptDate: Date
  description: string | null
  status: string
  submittedAt: Date | null
  createdAt: Date
  updatedAt: Date
  reimbursedAt: Date | null
  user: { firstName: string; lastName: string }
  approver: { firstName: string; lastName: string } | null
  reimbursedBy: { firstName: string; lastName: string } | null
  receipts: Array<{ id: string; s3Key: string; url: string; fileName: string; mimeType: string }>
  approvals: Array<{
    id: string
    status: string
    comment: string | null
    actedAt: Date | null
    approver: { firstName: string; lastName: string }
  }>
}): SerializedApprovalExpense {
  return {
    ...e,
    receiptDate: e.receiptDate.toISOString(),
    submittedAt: e.submittedAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    reimbursedAt: e.reimbursedAt?.toISOString() ?? null,
    approver: e.approver ?? null,
    reimbursedBy: e.reimbursedBy ?? null,
    approvals: e.approvals.map(a => ({
      ...a,
      actedAt: a.actedAt?.toISOString() ?? null,
    })),
  }
}

// Expenses module hidden per HR/finance team decision (2026-06).
const HIDDEN: boolean = true

export default async function ExpenseApprovalsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  if (HIDDEN) notFound()
  const session = await verifySession()
  const params = await searchParams
  const tab = params.tab ?? 'approve'
  const isAdmin = session.role === 'ADMIN'

  // Fetch expenses based on active tab
  let toApprove: SerializedApprovalExpense[] = []
  let toReimburse: SerializedApprovalExpense[] = []
  let allExpenses: SerializedApprovalExpense[] = []

  if (tab === 'reimburse' && isAdmin) {
    const raw = await getReimbursableExpenses()
    toReimburse = raw.map(serializeExpense)
  } else if (tab === 'all') {
    const raw = await getApprovalExpenses({
      employee: params.employee,
      category: params.category,
      status: params.status,
      dateFrom: params.from,
      dateTo: params.to,
    })
    allExpenses = raw.map(serializeExpense)
  } else {
    // Default: approve tab
    const raw = await getPendingExpenseApprovals()
    toApprove = raw.map(serializeExpense)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expense Approvals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and approve submitted expense claims
        </p>
      </div>

      <Suspense fallback={<div className="text-muted-foreground text-sm">Loading...</div>}>
        <ApprovalsClient
          tab={tab}
          isAdmin={isAdmin}
          toApprove={toApprove}
          toReimburse={toReimburse}
          allExpenses={allExpenses}
          filters={{
            employee: params.employee ?? '',
            category: params.category ?? '',
            status: params.status ?? '',
            from: params.from ?? '',
            to: params.to ?? '',
          }}
        />
      </Suspense>
    </div>
  )
}
