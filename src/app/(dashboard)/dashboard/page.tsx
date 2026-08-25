import Link from 'next/link'
import { verifySession } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { db } from '@/lib/db'
import { getDashboardData } from '@/actions/dashboard'
import { getLeaveBalances } from '@/actions/leaveBalance'
import { getLeaveRequests, getPendingApprovals } from '@/actions/leave'
import { getPendingApprovals as getPendingTimeApprovals } from '@/actions/timeEntry'
import { hasOutstandingOnboarding } from '@/actions/onboarding'
import { getMyLetters } from '@/actions/letters'
import { loadEmployeeProfile } from '@/lib/profileData'
import { LeaveBalanceCards } from '@/components/leave/LeaveBalanceCards'
import { LeaveHistoryTable } from '@/components/leave/LeaveHistoryTable'
import { ApprovalList } from '@/components/leave/ApprovalList'
import { ApprovalQueue } from '@/components/time/ApprovalQueue'
import { CountryHolidays } from '@/components/people/CountryHolidays'
import { WhosOut } from '@/components/calendar/WhosOut'
import { BirthdayWidget } from '@/components/dashboard/BirthdayWidget'
import { EmployeeProfile } from '@/components/people/EmployeeProfile'
import { WorkPassManager } from '@/components/people/WorkPassManager'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

/**
 * The dashboard.
 *
 * It used to be one of four screens showing the same person's own information:
 * a dashboard with leave balances, a profile page with their record, a Time Off
 * page with their balances again, and an Approvals page reachable only from a
 * dashboard card that vanished when the queue was empty. They are now tabs on
 * one screen, which is also the answer to "where do I find my own things".
 *
 * The Approvals tab collects the leave and timesheet queues, because "what is
 * waiting for me?" is one question and answering it used to mean visiting two
 * pages.
 */

type Props = { searchParams: Promise<{ tab?: string }> }

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'profile', label: 'My profile' },
  { key: 'timeoff', label: 'Time off' },
  { key: 'approvals', label: 'Approvals' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default async function DashboardPage({ searchParams }: Props) {
  const session = await verifySession()
  const { tab: rawTab } = await searchParams

  const currentYear = new Date().getFullYear()

  const [dashData, balances, onboardingDue, myLetters, directReportCount] = await Promise.all([
    getDashboardData(session.userId),
    getLeaveBalances(session.userId, currentYear),
    hasOutstandingOnboarding(session.userId),
    getMyLetters(),
    db.user.count({ where: { reportingManagerId: session.userId, status: 'ACTIVE' } }),
  ])

  const isApprover =
    directReportCount > 0 ||
    can(session.role, 'leave.approve') ||
    can(session.role, 'time.approve')

  const visibleTabs = TABS.filter(t => t.key !== 'approvals' || isApprover)
  const tab: TabKey = visibleTabs.some(t => t.key === rawTab) ? (rawTab as TabKey) : 'overview'

  const lettersToSign = myLetters.filter(l => l.status === 'SENT')

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {greeting}, {dashData.user?.firstName}
          </h1>
          <p className="text-muted-foreground">Everything of yours, in one place</p>
        </div>
        <Link href="/leave/request" className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}>
          Request leave
        </Link>
      </div>

      {/* Things genuinely waiting on this person, on every tab */}
      {lettersToSign.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>
            You have {lettersToSign.length} letter{lettersToSign.length === 1 ? '' : 's'} to read and
            sign.
          </strong>{' '}
          <Link href="/my-letters" className="font-medium underline">
            Open my letters →
          </Link>
        </div>
      )}
      {onboardingDue && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>We still need your onboarding documents.</strong> Your NRIC, bank details and any
          permit are needed before you can be added to payroll.{' '}
          <Link href="/onboarding" className="font-medium underline">
            Send them now →
          </Link>
        </div>
      )}

      {/* Tabs */}
      <nav className="flex flex-wrap gap-1 border-b border-border">
        {visibleTabs.map(t => (
          <Link
            key={t.key}
            href={t.key === 'overview' ? '/dashboard' : `/dashboard?tab=${t.key}`}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              t.key === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.key === 'approvals' && dashData.pendingLeaveCount > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-xs text-primary">
                {dashData.pendingLeaveCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Leave balances</h2>
            <LeaveBalanceCards balances={balances} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <CountryHolidays country={dashData.user?.country ?? 'SG'} />
            <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <h3 className="mb-4 text-sm font-medium">Who&apos;s out</h3>
              <WhosOut />
            </div>
            <BirthdayWidget birthdays={dashData.birthdays} />
          </div>
        </div>
      )}

      {tab === 'profile' && <ProfileTab userId={session.userId} session={session} />}

      {tab === 'timeoff' && <TimeOffTab userId={session.userId} year={currentYear} />}

      {tab === 'approvals' && isApprover && (
        <ApprovalsTab
          canApproveLeave={directReportCount > 0 || can(session.role, 'leave.approve')}
          canApproveTime={directReportCount > 0 || can(session.role, 'time.approve')}
        />
      )}
    </div>
  )
}

// ============================================================
// Tabs
// ============================================================

async function ProfileTab({
  userId,
  session,
}: {
  userId: string
  session: Awaited<ReturnType<typeof verifySession>>
}) {
  const data = await loadEmployeeProfile(userId, session)
  if (!data) return <p className="text-sm text-muted-foreground">Your record could not be loaded.</p>

  return (
    <EmployeeProfile
      user={data.user}
      isAdmin={data.isHrView}
      isSelf
      managers={data.managers}
      leaveBalances={data.leaveBalances}
      leaveRequests={data.leaveRequests}
      leaveAuditLogs={data.leaveAuditLogs}
      currentYear={data.currentYear}
      careerEvents={data.careerEvents}
      workPassSlot={
        data.workPasses.length > 0 || data.isHrView ? (
          <WorkPassManager
            userId={userId}
            passes={data.workPasses}
            employee={data.employeeForPass}
            // Your own passes are a record to read. Only HR maintains them.
            readOnly={!data.isHrView}
          />
        ) : undefined
      }
    />
  )
}

async function TimeOffTab({ userId, year }: { userId: string; year: number }) {
  const [balances, requests] = await Promise.all([getLeaveBalances(userId, year), getLeaveRequests()])

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {year} leave balances
        </h2>
        <LeaveBalanceCards balances={balances} />
      </div>
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Leave history
        </h2>
        <LeaveHistoryTable requests={requests} />
      </div>
    </div>
  )
}

async function ApprovalsTab({
  canApproveLeave,
  canApproveTime,
}: {
  canApproveLeave: boolean
  canApproveTime: boolean
}) {
  const [leave, timesheets] = await Promise.all([
    canApproveLeave ? getPendingApprovals() : [],
    canApproveTime ? getPendingTimeApprovals() : [],
  ])

  const nothingWaiting = leave.length === 0 && timesheets.length === 0

  return (
    <div className="space-y-8">
      {nothingWaiting && (
        <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
          Nothing is waiting for you. Anything your team submits will appear here.
        </p>
      )}

      {canApproveLeave && leave.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Leave requests ({leave.length})
          </h2>
          <ApprovalList requests={leave} />
        </section>
      )}

      {canApproveTime && timesheets.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Timesheets ({timesheets.length})
          </h2>
          <ApprovalQueue
            entries={timesheets.map(e => ({
              id: e.id,
              workDate: e.workDate.toISOString(),
              hoursWorked: e.hoursWorked.toString(),
              isPublicHoliday: e.isPublicHoliday,
              description: e.description,
              user: {
                id: e.user.id,
                firstName: e.user.firstName,
                lastName: e.user.lastName,
                hourlyRate: e.user.hourlyRate ? e.user.hourlyRate.toString() : null,
              },
            }))}
          />
        </section>
      )}

    </div>
  )
}
