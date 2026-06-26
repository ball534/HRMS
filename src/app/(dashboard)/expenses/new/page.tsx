import Link from 'next/link'
import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

// Expenses module hidden per HR/finance team decision (2026-06).
const HIDDEN: boolean = true

export default async function NewExpensePage() {
  if (HIDDEN) notFound()
  await verifySession()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/expenses" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Expense</h1>
          <p className="text-muted-foreground">Create a new expense claim</p>
        </div>
      </div>

      <div className="mx-auto max-w-xl rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <ExpenseForm />
      </div>
    </div>
  )
}
