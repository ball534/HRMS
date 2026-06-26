import Link from 'next/link'
import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { getExpenses } from '@/actions/expense'
import { ExpenseList } from '@/components/expenses/ExpenseList'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

type Props = {
  searchParams: Promise<{
    category?: string
    status?: string
    from?: string
    to?: string
  }>
}

// Expenses module hidden per HR/finance team decision (2026-06). The HIDDEN
// flag keeps the rest of the file as live, type-checked code so we can re-enable
// the module by flipping it back to `false` without re-debugging types.
const HIDDEN: boolean = true

export default async function ExpensesPage({ searchParams }: Props) {
  if (HIDDEN) notFound()
  const session = await verifySession()
  const params = await searchParams

  const expenses = await getExpenses({
    category: params.category,
    status: params.status,
    from: params.from,
    to: params.to,
  })

  const isAdmin = session.role === 'ADMIN'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-muted-foreground">
            {isAdmin ? 'All expense claims' : 'Your expense claims'}
          </p>
        </div>
        <Link href="/expenses/new" className={cn(buttonVariants())}>
          New Expense
        </Link>
      </div>

      {/* Expense list with filters */}
      <ExpenseList
        expenses={expenses.map(e => ({
          ...e,
          receiptDate: e.receiptDate.toString(),
          submittedAt: e.submittedAt?.toString() ?? null,
          createdAt: e.createdAt.toString(),
        }))}
        showEmployeeColumn={isAdmin}
      />
    </div>
  )
}
