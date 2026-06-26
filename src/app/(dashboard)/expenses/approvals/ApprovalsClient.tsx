'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { ExpenseApprovalCard } from '@/components/expenses/ExpenseApprovalCard'
import { ExpenseDetailModal } from '@/components/expenses/ExpenseDetailModal'
import { EXPENSE_CATEGORIES, formatCurrency, type CurrencyCode } from '@/lib/expense-constants'
import { bulkReimburse } from '@/actions/expense'
import { Button } from '@/components/ui/button'
import type { SerializedApprovalExpense } from './page'

type ExpenseDetailShape = {
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
  receipts: Array<{ id: string; url: string; mimeType: string; fileName: string }>
  approvals: Array<{
    id: string
    status: string
    comment: string | null
    actedAt: string | null
    approver: { firstName: string; lastName: string }
  }>
}

type ApprovalsClientProps = {
  tab: string
  isAdmin: boolean
  toApprove: SerializedApprovalExpense[]
  toReimburse: SerializedApprovalExpense[]
  allExpenses: SerializedApprovalExpense[]
  filters: {
    employee: string
    category: string
    status: string
    from: string
    to: string
  }
}

const EXPENSE_STATUSES = [
  { value: 'FOR_APPROVAL', label: 'For Approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'REIMBURSED', label: 'Reimbursed' },
]

const TABS = [
  { key: 'approve', label: 'To Approve' },
  { key: 'reimburse', label: 'To Reimburse', adminOnly: true },
  { key: 'all', label: 'All' },
]

export function ApprovalsClient({
  tab,
  isAdmin,
  toApprove,
  toReimburse,
  allExpenses,
  filters,
}: ApprovalsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedExpense, setSelectedExpense] = useState<ExpenseDetailShape | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [canApproveModal, setCanApproveModal] = useState(false)
  const [canReimburseModal, setCanReimburseModal] = useState(false)

  // Bulk reimburse state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [reimbursing, setReimbursing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportingFiltered, setExportingFiltered] = useState(false)

  function openModal(expense: SerializedApprovalExpense, canApprove: boolean, canReimburse: boolean) {
    setSelectedExpense(expense)
    setCanApproveModal(canApprove)
    setCanReimburseModal(canReimburse)
    setModalOpen(true)
  }

  function switchTab(newTab: string) {
    setSelectedIds(new Set())
    const params = new URLSearchParams()
    params.set('tab', newTab)
    router.push(`/expenses/approvals?${params.toString()}`)
  }

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'all')
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/expenses/approvals?${params.toString()}`)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === toReimburse.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(toReimburse.map(e => e.id)))
    }
  }

  async function handleBulkReimburse() {
    if (selectedIds.size === 0) return
    setReimbursing(true)
    try {
      const result = await bulkReimburse(Array.from(selectedIds))
      if (result.success) {
        toast.success(`${result.count} expense${result.count > 1 ? 's' : ''} marked as reimbursed`)
        setSelectedIds(new Set())
        router.refresh()
      } else {
        toast.error(result.error ?? 'Failed to reimburse')
      }
    } catch {
      toast.error('Failed to reimburse expenses')
    } finally {
      setReimbursing(false)
    }
  }

  async function handleExportExcel() {
    setExporting(true)
    try {
      const res = await fetch('/api/expenses/export-reimbursement')
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error ?? 'Failed to export')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'reimbursement.xlsx'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Excel exported')
    } catch {
      toast.error('Failed to export')
    } finally {
      setExporting(false)
    }
  }

  async function handleExportFiltered() {
    setExportingFiltered(true)
    try {
      const params = new URLSearchParams()
      if (filters.employee) params.set('employee', filters.employee)
      if (filters.category) params.set('category', filters.category)
      if (filters.status) params.set('status', filters.status)
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      const res = await fetch(`/api/expenses/export-filtered?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error ?? 'Failed to export')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'expenses.xlsx'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Excel exported')
    } catch {
      toast.error('Failed to export')
    } finally {
      setExportingFiltered(false)
    }
  }

  // Calculate total for selected
  const selectedTotal = toReimburse
    .filter(e => selectedIds.has(e.id))
    .reduce((acc, e) => {
      const key = e.currency
      acc[key] = (acc[key] ?? 0) + parseFloat(e.amount)
      return acc
    }, {} as Record<string, number>)

  // Determine which expenses to show
  let activeExpenses: SerializedApprovalExpense[] = []
  if (tab === 'approve') activeExpenses = toApprove
  else if (tab === 'reimburse') activeExpenses = toReimburse
  else if (tab === 'all') activeExpenses = allExpenses

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin)

  return (
    <>
      {/* Tab navigation */}
      <div className="flex gap-1 rounded-lg bg-muted/30 p-1 w-fit">
        {visibleTabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => switchTab(t.key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {t.key === 'approve' && toApprove.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs text-white">
                {toApprove.length}
              </span>
            )}
            {t.key === 'reimburse' && toReimburse.length > 0 && (
              <span className="ml-1.5 rounded-full bg-blue-500 px-1.5 py-0.5 text-xs text-white">
                {toReimburse.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bulk reimburse toolbar */}
      {tab === 'reimburse' && toReimburse.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.size === toReimburse.length && toReimburse.length > 0}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-muted-foreground">
              {selectedIds.size === 0
                ? 'Select all'
                : `${selectedIds.size} of ${toReimburse.length} selected`}
            </span>
          </label>

          {selectedIds.size > 0 && (
            <>
              <div className="text-sm text-muted-foreground">
                Total:{' '}
                {Object.entries(selectedTotal).map(([currency, total], i) => (
                  <span key={currency} className="font-medium text-foreground">
                    {i > 0 ? ' + ' : ''}
                    {formatCurrency(total, currency as CurrencyCode)}
                  </span>
                ))}
              </div>
              <Button
                size="sm"
                onClick={handleBulkReimburse}
                disabled={reimbursing}
              >
                {reimbursing
                  ? 'Processing...'
                  : `Mark ${selectedIds.size} as Reimbursed`}
              </Button>
            </>
          )}

          <div className="ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportExcel}
              disabled={exporting}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {exporting ? 'Exporting...' : 'Export Excel'}
            </Button>
          </div>
        </div>
      )}

      {/* All tab filters */}
      {tab === 'all' && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={filters.employee}
            onChange={e => updateFilter('employee', e.target.value)}
            placeholder="Search employee..."
            className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          />
          <select
            value={filters.category}
            onChange={e => updateFilter('category', e.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            <option value="">All Categories</option>
            {EXPENSE_CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={e => updateFilter('status', e.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            <option value="">All Statuses</option>
            {EXPENSE_STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.from}
              onChange={e => updateFilter('from', e.target.value)}
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
              aria-label="From date"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={filters.to}
              onChange={e => updateFilter('to', e.target.value)}
              min={filters.from || undefined}
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
              aria-label="To date"
            />
          </div>
          <div className="ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportFiltered}
              disabled={exportingFiltered || allExpenses.length === 0}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {exportingFiltered ? 'Exporting...' : 'Export Excel'}
            </Button>
          </div>
        </div>
      )}

      {/* Expense list */}
      {activeExpenses.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeExpenses.map(expense => (
            <div key={expense.id} className="relative">
              {/* Checkbox for reimburse tab */}
              {tab === 'reimburse' && (
                <div className="absolute left-3 top-3 z-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(expense.id)}
                    onChange={() => toggleSelect(expense.id)}
                    onClick={e => e.stopPropagation()}
                    className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                  />
                </div>
              )}
              <div className={tab === 'reimburse' ? 'pl-4' : ''}>
                <ExpenseApprovalCard
                  expense={{
                    id: expense.id,
                    category: expense.category,
                    amount: expense.amount,
                    currency: expense.currency,
                    merchant: expense.merchant,
                    receiptDate: expense.receiptDate,
                    status: expense.status,
                    submittedAt: expense.submittedAt,
                    user: expense.user,
                    receipts: expense.receipts,
                  }}
                  onClick={() =>
                    openModal(
                      expense,
                      tab === 'approve' && expense.status === 'FOR_APPROVAL',
                      tab === 'reimburse' && expense.status === 'APPROVED',
                    )
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedExpense && (
        <ExpenseDetailModal
          expense={selectedExpense}
          open={modalOpen}
          onOpenChange={setModalOpen}
          canApprove={canApproveModal}
          canReimburse={canReimburseModal}
          isAdmin={isAdmin}
        />
      )}
    </>
  )
}

function EmptyState({ tab }: { tab: string }) {
  const messages: Record<string, { title: string; subtitle: string }> = {
    approve: {
      title: 'No pending approvals',
      subtitle: 'Expenses submitted for your approval will appear here.',
    },
    reimburse: {
      title: 'No expenses pending reimbursement',
      subtitle: 'Approved expenses awaiting reimbursement will appear here.',
    },
    all: {
      title: 'No expenses found',
      subtitle: 'Try adjusting your filters.',
    },
  }

  const { title, subtitle } = messages[tab] ?? messages.all

  return (
    <div className="rounded-xl bg-card p-12 text-center ring-1 ring-foreground/10">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      {tab === 'approve' && (
        <Link
          href="/expenses"
          className="mt-4 inline-block text-sm text-primary hover:underline"
        >
          View all expenses
        </Link>
      )}
    </div>
  )
}
