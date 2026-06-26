'use client'

import { EXPENSE_CATEGORIES, formatCurrency } from '@/lib/expense-constants'
import { FileText } from 'lucide-react'

type Receipt = {
  id: string
  fileName: string
  mimeType: string
}

type ExpenseApprovalCardProps = {
  expense: {
    id: string
    category: string
    amount: string
    currency: string
    merchant: string
    receiptDate: string
    status: string
    submittedAt: string | null
    user: { firstName: string; lastName: string }
    receipts: Receipt[]
  }
  onClick: () => void
}

// ============================================================
// Helpers
// ============================================================

const AVATAR_COLORS = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-teal-500', 'bg-cyan-500', 'bg-blue-500', 'bg-violet-500',
  'bg-purple-500', 'bg-pink-500',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
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

function getCategoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find(c => c.value === value)?.label ?? value
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ============================================================
// Component
// ============================================================

export function ExpenseApprovalCard({ expense, onClick }: ExpenseApprovalCardProps) {
  const fullName = `${expense.user.firstName} ${expense.user.lastName}`
  const initials = `${expense.user.firstName[0] ?? ''}${expense.user.lastName[0] ?? ''}`.toUpperCase()
  const avatarColor = getAvatarColor(fullName)
  const receiptCount = expense.receipts.length

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/10 space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Employee row */}
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor}`}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{fullName}</p>
          <p className="text-xs text-muted-foreground truncate">{getCategoryLabel(expense.category)}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-sm font-semibold">
            {formatCurrency(expense.amount, expense.currency)}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[expense.status] ?? ''}`}
          >
            {STATUS_LABELS[expense.status] ?? expense.status}
          </span>
        </div>
      </div>

      {/* Details row */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-3 min-w-0">
          <span className="truncate">{expense.merchant}</span>
          <span className="shrink-0">·</span>
          <span className="shrink-0">{formatDate(expense.receiptDate)}</span>
        </div>
        {receiptCount > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <FileText className="h-3 w-3" />
            <span>{receiptCount} {receiptCount === 1 ? 'receipt' : 'receipts'}</span>
          </div>
        )}
      </div>
    </button>
  )
}
