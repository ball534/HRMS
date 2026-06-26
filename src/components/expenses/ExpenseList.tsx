'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CurrencyAmount } from './CurrencyAmount'
import { EXPENSE_CATEGORIES } from '@/lib/expense-constants'

type Expense = {
  id: string
  category: string
  amount: string
  currency: string
  merchant: string
  receiptDate: string | Date
  status: string
  submittedAt: string | Date | null
  createdAt: string | Date
  user: { firstName: string; lastName: string }
}

type ExpenseListProps = {
  expenses: Expense[]
  showEmployeeColumn?: boolean
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

const EXPENSE_STATUSES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'FOR_APPROVAL', label: 'For Approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'REIMBURSED', label: 'Reimbursed' },
]

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getCategoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find(c => c.value === value)?.label ?? value
}

export function ExpenseList({ expenses, showEmployeeColumn = false }: ExpenseListProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentCategory = searchParams.get('category') ?? ''
  const currentStatus = searchParams.get('status') ?? ''
  const currentFrom = searchParams.get('from') ?? ''
  const currentTo = searchParams.get('to') ?? ''

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/expenses?${params.toString()}`)
  }

  if (expenses.length === 0) {
    return (
      <div>
        {/* Filters */}
        <Filters
          currentCategory={currentCategory}
          currentStatus={currentStatus}
          currentFrom={currentFrom}
          currentTo={currentTo}
          onUpdateFilter={updateFilter}
        />
        <div className="rounded-xl bg-card p-12 text-center ring-1 ring-foreground/10 mt-4">
          <p className="mb-4 text-muted-foreground">No expenses found.</p>
          <Link href="/expenses/new">
            <Button size="sm">Create Expense</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Filters
        currentCategory={currentCategory}
        currentStatus={currentStatus}
        currentFrom={currentFrom}
        currentTo={currentTo}
        onUpdateFilter={updateFilter}
      />

      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Category</th>
              <th className="px-4 py-3 text-left font-medium">Merchant</th>
              <th className="px-4 py-3 text-left font-medium">Amount</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              {showEmployeeColumn && (
                <th className="px-4 py-3 text-left font-medium">Employee</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {expenses.map(expense => (
              <tr
                key={expense.id}
                className="cursor-pointer transition-colors hover:bg-muted/20"
                onClick={() => router.push(`/expenses/${expense.id}`)}
              >
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(expense.receiptDate)}
                </td>
                <td className="px-4 py-3">
                  {getCategoryLabel(expense.category)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {expense.merchant}
                </td>
                <td className="px-4 py-3 font-medium">
                  <CurrencyAmount amount={expense.amount} currency={expense.currency} />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[expense.status] ?? ''}`}
                  >
                    {STATUS_LABELS[expense.status] ?? expense.status}
                  </span>
                </td>
                {showEmployeeColumn && (
                  <td className="px-4 py-3 text-muted-foreground">
                    {expense.user.firstName} {expense.user.lastName}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {expenses.map(expense => (
          <Link
            key={expense.id}
            href={`/expenses/${expense.id}`}
            className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/10"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{getCategoryLabel(expense.category)}</p>
                <p className="text-sm text-muted-foreground truncate">{expense.merchant}</p>
                {showEmployeeColumn && (
                  <p className="text-xs text-muted-foreground">
                    {expense.user.firstName} {expense.user.lastName}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <CurrencyAmount
                  amount={expense.amount}
                  currency={expense.currency}
                  className="font-semibold"
                />
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[expense.status] ?? ''}`}
                >
                  {STATUS_LABELS[expense.status] ?? expense.status}
                </span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{formatDate(expense.receiptDate)}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// Filters sub-component
// ============================================================

type FiltersProps = {
  currentCategory: string
  currentStatus: string
  currentFrom: string
  currentTo: string
  onUpdateFilter: (key: string, value: string) => void
}

function Filters({ currentCategory, currentStatus, currentFrom, currentTo, onUpdateFilter }: FiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {/* Category filter */}
      <select
        value={currentCategory}
        onChange={e => onUpdateFilter('category', e.target.value)}
        className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
      >
        <option value="">All Categories</option>
        {EXPENSE_CATEGORIES.map(c => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>

      {/* Status filter */}
      <select
        value={currentStatus}
        onChange={e => onUpdateFilter('status', e.target.value)}
        className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
      >
        <option value="">All Statuses</option>
        {EXPENSE_STATUSES.map(s => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      {/* Date range */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={currentFrom}
          onChange={e => onUpdateFilter('from', e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          aria-label="From date"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={currentTo}
          onChange={e => onUpdateFilter('to', e.target.value)}
          min={currentFrom || undefined}
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          aria-label="To date"
        />
      </div>
    </div>
  )
}
