import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { getExpenseDetail } from '@/actions/expense'
import { formatCurrency, EXPENSE_CATEGORIES } from '@/lib/expenses'
import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

type Props = {
  params: Promise<{ id: string }>
}

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  FOR_APPROVAL: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  REIMBURSED: 'bg-blue-50 text-blue-700 border-blue-200',
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  FOR_APPROVAL: 'For Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REIMBURSED: 'Reimbursed',
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function getCategoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find(c => c.value === value)?.label ?? value
}

// Expenses module hidden per HR/finance team decision (2026-06).
const HIDDEN: boolean = true

export default async function ExpenseDetailPage({ params }: Props) {
  if (HIDDEN) notFound()
  const { id } = await params
  await verifySession()

  let expense
  try {
    expense = await getExpenseDetail(id)
  } catch {
    redirect('/expenses')
  }

  if (!expense) {
    redirect('/expenses')
  }

  // DRAFT: render editable form
  if (expense.status === 'DRAFT') {
    const receiptDate = expense.receiptDate
      ? new Date(expense.receiptDate).toISOString().split('T')[0]
      : ''

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/expenses" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Back
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Edit Expense</h1>
            <p className="text-muted-foreground">Update your draft expense</p>
          </div>
        </div>

        <div className="mx-auto max-w-xl rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <ExpenseForm
            expense={{
              id: expense.id,
              category: expense.category,
              amount: expense.amount,
              currency: expense.currency,
              merchant: expense.merchant,
              receiptDate,
              description: expense.description,
              receipts: expense.receipts.map(r => ({
                id: r.id,
                fileName: r.fileName,
                mimeType: r.mimeType,
                url: r.downloadUrl,
              })),
            }}
          />
        </div>
      </div>
    )
  }

  // Non-DRAFT: read-only detail view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/expenses" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Expense Details</h1>
          <p className="text-muted-foreground">
            {expense.user.firstName} {expense.user.lastName}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Details card */}
        <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10 space-y-4">
          {/* Status badge */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${STATUS_CLASSES[expense.status] ?? ''}`}
            >
              {STATUS_LABELS[expense.status] ?? expense.status}
            </span>
          </div>

          <div className="border-t border-border" />

          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Category</dt>
              <dd className="font-medium">{getCategoryLabel(expense.category)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="font-medium">
                {formatCurrency(expense.amount, expense.currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Merchant</dt>
              <dd>{expense.merchant}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Receipt Date</dt>
              <dd>{formatDate(expense.receiptDate)}</dd>
            </div>
            {expense.description && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Description</dt>
                <dd className="max-w-xs text-right">{expense.description}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Approver</dt>
              <dd>
                {expense.approver
                  ? `${expense.approver.firstName} ${expense.approver.lastName}`
                  : '—'}
              </dd>
            </div>
            {expense.submittedAt && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Submitted</dt>
                <dd>{formatDate(expense.submittedAt)}</dd>
              </div>
            )}
            {expense.reimbursedAt && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Reimbursed</dt>
                <dd>{formatDate(expense.reimbursedAt)}</dd>
              </div>
            )}
            {expense.reimbursedBy && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Reimbursed By</dt>
                <dd>{expense.reimbursedBy.firstName} {expense.reimbursedBy.lastName}</dd>
              </div>
            )}
          </dl>

          {/* Approval history */}
          {expense.approvals && expense.approvals.length > 0 && (
            <>
              <div className="border-t border-border" />
              <div>
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">Approval History</h3>
                <div className="space-y-2">
                  {expense.approvals.map(approval => (
                    <div key={approval.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {approval.approver.firstName} {approval.approver.lastName}
                      </span>
                      <div className="flex items-center gap-3">
                        {approval.actedAt && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(approval.actedAt)}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                            approval.status === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : approval.status === 'REJECTED'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {approval.status === 'PENDING'
                            ? 'Pending'
                            : approval.status === 'APPROVED'
                            ? 'Approved'
                            : 'Rejected'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Receipts */}
        {expense.receipts.length > 0 && (
          <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10 space-y-4">
            <h2 className="text-sm font-semibold">Receipts</h2>
            <div className="space-y-4">
              {expense.receipts.map(receipt => (
                <div key={receipt.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{receipt.fileName}</span>
                    <a
                      href={receipt.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Download
                    </a>
                  </div>
                  {receipt.mimeType.startsWith('image/') ? (
                    // Image: render as thumbnail with link

                    <a href={receipt.downloadUrl} target="_blank" rel="noopener noreferrer">
                      <img
                        src={receipt.downloadUrl}
                        alt={receipt.fileName}
                        className="max-h-64 w-full rounded-lg object-contain bg-muted"
                      />
                    </a>
                  ) : (
                    // PDF: iframe on desktop, download link fallback for mobile
                    <>
                      <iframe
                        src={receipt.downloadUrl}
                        className="hidden md:block w-full h-96 rounded-lg border border-border"
                        title={receipt.fileName}
                      />
                      <p className="md:hidden text-xs text-muted-foreground">
                        PDF preview not available on mobile.{' '}
                        <a
                          href={receipt.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Open PDF
                        </a>
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
