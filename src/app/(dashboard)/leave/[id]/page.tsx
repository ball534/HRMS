import { notFound } from 'next/navigation'
import Link from 'next/link'
import { verifySession } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { db } from '@/lib/db'
import { getAttachmentUrl } from '@/actions/leave'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { LeaveDetailActions } from '@/components/leave/LeaveDetailActions'

type Props = {
  params: Promise<{ id: string }>
}

const STATUS_CLASSES = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
}

const STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export default async function LeaveDetailPage({ params }: Props) {
  const { id } = await params
  const session = await verifySession()

  const request = await db.leaveRequest.findUnique({
    where: { id },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      leaveType: { select: { name: true } },
      approver: { select: { firstName: true, lastName: true } },
    },
  })

  if (!request) notFound()

  const isOwner = session.userId === request.userId
  const isApprover = session.userId === request.approverId
  const isAdmin = can(session.role, 'leave.admin')

  // Verify access
  if (!isOwner && !isApprover && !isAdmin) notFound()

  // Fetch attachment URL if applicable
  const attachmentInfo = request.attachmentBlobId
    ? await getAttachmentUrl(id)
    : null

  const canApproveReject = (isApprover || isAdmin) && request.status === 'PENDING'
  const canCancel =
    (isOwner && request.status === 'PENDING') ||
    (isAdmin && request.status !== 'CANCELLED')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard?tab=timeoff" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Leave Request</h1>
          <p className="text-muted-foreground">
            {request.user.firstName} {request.user.lastName}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Details card */}
        <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10 space-y-4">
          {/* Status badge */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${STATUS_CLASSES[request.status]}`}
            >
              {STATUS_LABELS[request.status]}
            </span>
          </div>

          <div className="border-t border-border" />

          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Leave Type</dt>
              <dd className="font-medium">{request.leaveType.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Start Date</dt>
              <dd>{formatDate(request.startDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">End Date</dt>
              <dd>{formatDate(request.endDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Working Days</dt>
              <dd>{request.daysCount} {request.daysCount === 1 ? 'day' : 'days'}</dd>
            </div>
            {request.halfDay !== 'NONE' && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Half Day</dt>
                <dd>{request.halfDay}</dd>
              </div>
            )}
            {request.reason && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Reason</dt>
                <dd className="max-w-xs text-right">{request.reason}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Approver</dt>
              <dd>
                {request.approver
                  ? `${request.approver.firstName} ${request.approver.lastName}`
                  : 'Not assigned'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Submitted</dt>
              <dd>{formatDate(request.createdAt)}</dd>
            </div>
            {request.approvedAt && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {request.status === 'APPROVED' ? 'Approved On' : 'Actioned On'}
                </dt>
                <dd>{formatDate(request.approvedAt)}</dd>
              </div>
            )}
            {request.rejectionReason && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {request.status === 'REJECTED' ? 'Rejection Reason' : 'Comment'}
                </dt>
                <dd className="max-w-xs text-right">{request.rejectionReason}</dd>
              </div>
            )}
            {request.cancelledAt && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Cancelled On</dt>
                <dd>{formatDate(request.cancelledAt)}</dd>
              </div>
            )}
          </dl>

          {/* Attachment */}
          {attachmentInfo && (
            <>
              <div className="border-t border-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Attachment</span>
                <a
                  href={attachmentInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {attachmentInfo.filename ?? 'Download'}
                </a>
              </div>
            </>
          )}
        </div>

        {/* Approve / Reject / Cancel / Delete actions (client component for interactive forms) */}
        {(canApproveReject || canCancel || isAdmin) && (
          <LeaveDetailActions
            requestId={id}
            canApproveReject={canApproveReject}
            canCancel={canCancel}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </div>
  )
}
