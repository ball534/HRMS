'use client'

import { useActionState, useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ApprovalTimeline, type TimelineStep } from './ApprovalTimeline'
import { ReceiptPreview } from './ReceiptPreview'
import { CurrencyAmount } from './CurrencyAmount'
import { EXPENSE_CATEGORIES } from '@/lib/expense-constants'
import { approveExpense, rejectExpense, markReimbursed, deleteExpense, type ExpenseActionState } from '@/actions/expense'

// ============================================================
// Types
// ============================================================

type Receipt = {
  id: string
  url: string
  mimeType: string
  fileName: string
}

type Approval = {
  id: string
  status: string
  comment: string | null
  actedAt: string | null
  approver: { firstName: string; lastName: string }
}

type ExpenseDetail = {
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
  user: { firstName: string; lastName: string }
  approver?: { firstName: string; lastName: string } | null
  reimbursedBy?: { firstName: string; lastName: string } | null
  reimbursedAt?: string | null
  receipts: Receipt[]
  approvals: Approval[]
}

type ExpenseDetailModalProps = {
  expense: ExpenseDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  canApprove: boolean
  canReimburse: boolean
  isAdmin?: boolean
}

// ============================================================
// Helpers
// ============================================================

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

function getCategoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find(c => c.value === value)?.label ?? value
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return format(new Date(d), 'dd MMM yyyy')
}

function buildTimelineSteps(expense: ExpenseDetail): TimelineStep[] {
  const steps: TimelineStep[] = []

  // Step 1: Submitted
  steps.push({
    label: 'Submitted',
    actor: `${expense.user.firstName} ${expense.user.lastName}`,
    actedAt: expense.submittedAt,
    status: 'completed',
  })

  // Step 2: Approval
  const approval = expense.approvals[0] ?? null
  let approvalStatus: TimelineStep['status'] = 'active'
  if (approval?.status === 'APPROVED') approvalStatus = 'completed'
  else if (approval?.status === 'REJECTED') approvalStatus = 'rejected'
  else if (expense.status === 'DRAFT') approvalStatus = 'pending'

  const approverName = expense.approver
    ? `${expense.approver.firstName} ${expense.approver.lastName}`
    : approval?.approver
      ? `${approval.approver.firstName} ${approval.approver.lastName}`
      : 'Approver'

  steps.push({
    label: approvalStatus === 'rejected' ? 'Rejected by' : approvalStatus === 'completed' ? 'Approved by' : 'Pending approval',
    actor: approverName,
    actedAt: approval?.actedAt ?? null,
    status: approvalStatus,
    comment: approval?.comment ?? null,
  })

  // Step 3: Reimbursement (only if approved or reimbursed)
  if (expense.status === 'APPROVED' || expense.status === 'REIMBURSED') {
    const reimbursedBy = expense.reimbursedBy
      ? `${expense.reimbursedBy.firstName} ${expense.reimbursedBy.lastName}`
      : 'Finance'

    steps.push({
      label: expense.status === 'REIMBURSED' ? 'Reimbursed by' : 'Pending reimbursement',
      actor: expense.status === 'REIMBURSED' ? reimbursedBy : '',
      actedAt: expense.reimbursedAt ?? null,
      status: expense.status === 'REIMBURSED' ? 'completed' : 'pending',
    })
  }

  return steps
}

// ============================================================
// Main Component
// ============================================================

const initialState: ExpenseActionState = {}

export function ExpenseDetailModal({
  expense,
  open,
  onOpenChange,
  canApprove,
  canReimburse,
  isAdmin,
}: ExpenseDetailModalProps) {
  const router = useRouter()
  const [comment, setComment] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, startDeleteTransition] = useTransition()

  const [approveState, approveAction, approvePending] = useActionState(approveExpense, initialState)
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectExpense, initialState)
  const [reimburseState, reimburseAction, reimbursePending] = useActionState(markReimbursed, initialState)

  function handleDeleteExpense() {
    startDeleteTransition(async () => {
      const result = await deleteExpense(expense.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Expense deleted')
        onOpenChange(false)
        router.refresh()
      }
    })
  }

  // Handle success/error responses
  useEffect(() => {
    if (approveState.success) {
      toast.success('Expense approved')
      onOpenChange(false)
      router.refresh()
    }
    if (approveState.error) {
      toast.error(approveState.error)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveState])

  useEffect(() => {
    if (rejectState.success) {
      toast.success('Expense rejected')
      onOpenChange(false)
      router.refresh()
    }
    if (rejectState.error) {
      toast.error(rejectState.error)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejectState])

  useEffect(() => {
    if (reimburseState.success) {
      toast.success('Expense marked as reimbursed')
      onOpenChange(false)
      router.refresh()
    }
    if (reimburseState.error) {
      toast.error(reimburseState.error)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reimburseState])

  const timelineSteps = buildTimelineSteps(expense)
  const showApproveReject = canApprove && expense.status === 'FOR_APPROVAL'
  const showReimburse = canReimburse && expense.status === 'APPROVED'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle>
              {expense.user.firstName} {expense.user.lastName}
            </DialogTitle>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[expense.status] ?? ''}`}
            >
              {STATUS_LABELS[expense.status] ?? expense.status}
            </span>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Details grid */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Details
            </h3>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4 sm:flex-col sm:gap-1">
                <dt className="text-muted-foreground">Category</dt>
                <dd className="font-medium text-right sm:text-left">{getCategoryLabel(expense.category)}</dd>
              </div>
              <div className="flex justify-between gap-4 sm:flex-col sm:gap-1">
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="font-semibold text-right sm:text-left">
                  <CurrencyAmount amount={expense.amount} currency={expense.currency} />
                </dd>
              </div>
              <div className="flex justify-between gap-4 sm:flex-col sm:gap-1">
                <dt className="text-muted-foreground">Currency</dt>
                <dd className="font-medium text-right sm:text-left">{expense.currency}</dd>
              </div>
              <div className="flex justify-between gap-4 sm:flex-col sm:gap-1">
                <dt className="text-muted-foreground">Merchant</dt>
                <dd className="font-medium text-right sm:text-left">{expense.merchant}</dd>
              </div>
              <div className="flex justify-between gap-4 sm:flex-col sm:gap-1">
                <dt className="text-muted-foreground">Receipt Date</dt>
                <dd className="font-medium text-right sm:text-left">{formatDate(expense.receiptDate)}</dd>
              </div>
              {expense.submittedAt && (
                <div className="flex justify-between gap-4 sm:flex-col sm:gap-1">
                  <dt className="text-muted-foreground">Submitted</dt>
                  <dd className="font-medium text-right sm:text-left">{formatDate(expense.submittedAt)}</dd>
                </div>
              )}
              {expense.description && (
                <div className="sm:col-span-2">
                  <dt className="mb-1 text-muted-foreground">Description</dt>
                  <dd className="rounded-lg bg-muted/30 px-3 py-2 text-sm">{expense.description}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Receipts */}
          {expense.receipts.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Receipts ({expense.receipts.length})
              </h3>
              <div className="space-y-4">
                {expense.receipts.map(receipt => (
                  <div key={receipt.id} className="rounded-lg border border-border p-3">
                    <ReceiptPreview receipt={receipt} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Approval Timeline */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Approval Timeline
            </h3>
            <ApprovalTimeline steps={timelineSteps} />
          </section>

          {/* Action buttons */}
          {showApproveReject && (
            <section className="rounded-lg border border-border p-4 space-y-4">
              <h3 className="text-sm font-semibold">Action Required</h3>

              {/* Comment */}
              <div>
                <label htmlFor="modal-comment" className="block text-xs text-muted-foreground mb-1">
                  Comment (optional)
                </label>
                <textarea
                  id="modal-comment"
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={2}
                  placeholder="Add a comment..."
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
                />
              </div>

              {/* Errors */}
              {(approveState.error ?? rejectState.error) && (
                <p className="text-xs text-rose-600">
                  {approveState.error ?? rejectState.error}
                </p>
              )}

              <div className="flex gap-3">
                <form action={approveAction} className="flex-1">
                  <input type="hidden" name="expenseId" value={expense.id} />
                  <input type="hidden" name="comment" value={comment} />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={approvePending}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white border-transparent"
                  >
                    {approvePending ? 'Approving...' : 'Approve'}
                  </Button>
                </form>
                <form action={rejectAction} className="flex-1">
                  <input type="hidden" name="expenseId" value={expense.id} />
                  <input type="hidden" name="comment" value={comment} />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={rejectPending}
                    variant="outline"
                    className="w-full border-rose-300 text-rose-700 hover:bg-rose-50"
                  >
                    {rejectPending ? 'Rejecting...' : 'Reject'}
                  </Button>
                </form>
              </div>
            </section>
          )}

          {showReimburse && (
            <section className="rounded-lg border border-border p-4 space-y-3">
              <h3 className="text-sm font-semibold">Reimbursement</h3>
              <p className="text-xs text-muted-foreground">
                Mark this expense as reimbursed to the employee.
              </p>
              {reimburseState.error && (
                <p className="text-xs text-rose-600">{reimburseState.error}</p>
              )}
              <form action={reimburseAction}>
                <input type="hidden" name="expenseId" value={expense.id} />
                <Button
                  type="submit"
                  size="sm"
                  disabled={reimbursePending}
                  className="bg-blue-600 hover:bg-blue-500 text-white border-transparent"
                >
                  {reimbursePending ? 'Processing...' : 'Mark as Reimbursed'}
                </Button>
              </form>
            </section>
          )}

          {isAdmin && (
            <section className="rounded-lg border border-rose-200 p-4 space-y-3">
              <h3 className="text-sm font-semibold">Admin: Delete Expense</h3>
              <p className="text-xs text-muted-foreground">
                Permanently delete this expense and its receipts.
              </p>
              {!showDeleteConfirm ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="border-rose-300 text-rose-700 hover:bg-rose-50"
                >
                  Delete Expense
                </Button>
              ) : (
                <div className="flex gap-3">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleDeleteExpense}
                    disabled={isDeleting}
                    className="bg-rose-600 hover:bg-rose-500 text-white border-transparent"
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
