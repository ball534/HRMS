import Link from 'next/link'
import { verifySession } from '@/lib/dal'
import { getLeaveBalances } from '@/actions/leaveBalance'
import { getLeaveRequests } from '@/actions/leave'
import { LeaveBalanceCards } from '@/components/leave/LeaveBalanceCards'
import { LeaveHistoryTable } from '@/components/leave/LeaveHistoryTable'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export default async function LeavePage() {
  const session = await verifySession()
  const currentYear = new Date().getFullYear()

  const [balances, requests] = await Promise.all([
    getLeaveBalances(session.userId, currentYear),
    getLeaveRequests(),
  ])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Time Off</h1>
          <p className="text-muted-foreground">Manage your leave requests and balances</p>
        </div>
        <Link href="/leave/request" className={cn(buttonVariants())}>
          Request Leave
        </Link>
      </div>

      {/* Balance cards */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {currentYear} Leave Balances
        </h2>
        <LeaveBalanceCards balances={balances} />
      </div>

      {/* Leave history */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Leave History
        </h2>
        <LeaveHistoryTable requests={requests} />
      </div>
    </div>
  )
}
