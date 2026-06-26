import { verifySession } from '@/lib/dal'
import { getPendingApprovals } from '@/actions/timeEntry'
import { ApprovalQueue } from '@/components/time/ApprovalQueue'

export default async function TimeApprovalsPage() {
  await verifySession()
  const entries = await getPendingApprovals()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Time Approvals</h1>
        <p className="text-muted-foreground">
          Approve or reject submitted timesheet entries from your direct reports. Approved entries
          flow into the monthly payroll calculation.
        </p>
      </div>

      <ApprovalQueue
        entries={entries.map(e => ({
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
    </div>
  )
}
