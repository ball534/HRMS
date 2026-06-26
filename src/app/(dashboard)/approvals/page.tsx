import { verifySession } from '@/lib/dal'
import { db } from '@/lib/db'
import { getPendingApprovals } from '@/actions/leave'
import { ApprovalList } from '@/components/leave/ApprovalList'

export default async function ApprovalsPage() {
  const session = await verifySession()

  // Check if user has any direct reports
  const directReportCount = await db.user.count({
    where: { reportingManagerId: session.userId },
  })

  if (directReportCount === 0 && session.role !== 'ADMIN') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Leave Approvals</h1>
          <p className="text-muted-foreground">Review and action pending leave requests</p>
        </div>
        <div className="rounded-xl bg-card p-12 text-center ring-1 ring-foreground/10">
          <p className="text-muted-foreground">You don&apos;t have any direct reports.</p>
        </div>
      </div>
    )
  }

  const pendingRequests = await getPendingApprovals()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leave Approvals</h1>
        <p className="text-muted-foreground">
          {pendingRequests.length > 0
            ? `${pendingRequests.length} pending request${pendingRequests.length !== 1 ? 's' : ''}`
            : 'No pending requests'}
        </p>
      </div>

      <ApprovalList requests={pendingRequests} />
    </div>
  )
}
