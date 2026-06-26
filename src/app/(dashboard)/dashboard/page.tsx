import Link from 'next/link'
import { verifySession } from '@/lib/dal'
import { getDashboardData } from '@/actions/dashboard'
import { getLeaveBalances } from '@/actions/leaveBalance'
import { LeaveBalanceCards } from '@/components/leave/LeaveBalanceCards'
import { CountryHolidays } from '@/components/people/CountryHolidays'
import { WhosOut } from '@/components/calendar/WhosOut'
import { BirthdayWidget } from '@/components/dashboard/BirthdayWidget'
import { ApprovalCountCard } from '@/components/dashboard/ApprovalCountCard'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export default async function DashboardPage() {
  const session = await verifySession()

  const [dashData, balances] = await Promise.all([
    getDashboardData(session.userId, session.role),
    getLeaveBalances(session.userId, new Date().getFullYear()),
  ])

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-8">
      {/* Row 1: Greeting + Quick Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {greeting}, {dashData.user?.firstName}
          </h1>
          <p className="text-muted-foreground">Here&apos;s what&apos;s happening today</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/leave/request"
              className={cn(buttonVariants({ variant: 'default', size: 'sm' }))}
            >
              Request Leave
            </Link>
          </div>
        </div>
        <Link
          href={`/people/${session.userId}`}
          className="text-sm text-primary hover:underline shrink-0"
        >
          View Profile
        </Link>
      </div>

      {/* Row 2: Approval Counts (role-gated) */}
      {dashData.pendingLeaveCount > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <ApprovalCountCard
            count={dashData.pendingLeaveCount}
            label="Leave requests to approve"
            href="/approvals"
          />
        </div>
      )}

      {/* Row 3: Leave Balances */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Leave Balances</h2>
        <LeaveBalanceCards balances={balances} />
      </div>

      {/* Row 4: Three-column widgets */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <CountryHolidays country={dashData.user?.country ?? 'SG'} />
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="mb-4 text-sm font-medium">Who&apos;s Out</h3>
          <WhosOut />
        </div>
        <BirthdayWidget birthdays={dashData.birthdays} />
      </div>
    </div>
  )
}
