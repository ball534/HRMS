'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { approveLeave, rejectLeave, type LeaveActionState } from '@/actions/leave'

type LeaveRequest = {
  id: string
  startDate: Date | string
  endDate: Date | string
  halfDay: 'NONE' | 'AM' | 'PM'
  daysCount: number
  reason?: string | null
  attachmentKey?: string | null
  attachmentName?: string | null
  createdAt: Date | string
  user: {
    firstName: string
    lastName: string
    department?: string | null
    country: string
  }
  leaveType: {
    name: string
  }
}

type Props = {
  requests: LeaveRequest[]
}

const AVATAR_COLORS = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-teal-500', 'bg-cyan-500', 'bg-blue-500', 'bg-violet-500',
  'bg-purple-500', 'bg-pink-500',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function formatDateRange(start: Date | string, end: Date | string): string {
  const s = new Date(start)
  const e = new Date(end)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  if (s.toDateString() === e.toDateString()) return fmt(s)
  return `${fmt(s)} – ${fmt(e)}`
}

const initialState: LeaveActionState = {}

function ApprovalCard({ request }: { request: LeaveRequest }) {
  const router = useRouter()
  const [showReject, setShowReject] = useState(false)
  const [approved, setApproved] = useState(false)
  const [rejected, setRejected] = useState(false)

  const [approveState, approveAction, approvePending] = useActionState(approveLeave, initialState)
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectLeave, initialState)

  if (approveState.success && !approved) {
    setApproved(true)
    router.refresh()
  }
  if (rejectState.success && !rejected) {
    setRejected(true)
    router.refresh()
  }

  const initials =
    `${request.user.firstName[0] ?? ''}${request.user.lastName[0] ?? ''}`.toUpperCase()
  const fullName = `${request.user.firstName} ${request.user.lastName}`
  const color = getAvatarColor(fullName)

  if (approved || rejected) {
    return null // Remove from list after action
  }

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-3">
      {/* Employee info */}
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${color}`}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium">{fullName}</p>
          <p className="text-xs text-muted-foreground">
            {request.user.department ?? 'No department'} · {request.user.country}
          </p>
        </div>
      </div>

      {/* Request details */}
      <div className="grid gap-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Type</span>
          <span className="font-medium">{request.leaveType.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Dates</span>
          <span>{formatDateRange(request.startDate, request.endDate)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Days</span>
          <span>{request.daysCount} {request.daysCount === 1 ? 'day' : 'days'}{request.halfDay !== 'NONE' ? ` (${request.halfDay})` : ''}</span>
        </div>
        {request.reason && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reason</span>
            <span className="max-w-xs text-right text-muted-foreground">{request.reason}</span>
          </div>
        )}
      </div>

      {/* Attachment link */}
      {request.attachmentKey && (
        <a
          href={`/leave/${request.id}`}
          className="text-xs font-medium text-primary hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          View Attachment
        </a>
      )}

      {/* Error */}
      {(approveState.error ?? rejectState.error) && (
        <p className="text-xs text-rose-600">
          {approveState.error ?? rejectState.error}
        </p>
      )}

      {/* Reject comment area */}
      {showReject && (
        <div>
          <label htmlFor={`comment-${request.id}`} className="text-xs text-muted-foreground">
            Rejection reason (optional)
          </label>
          <textarea
            id={`comment-${request.id}`}
            name="comment"
            form={`reject-form-${request.id}`}
            rows={2}
            placeholder="Add a reason..."
            className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <form id={`approve-form-${request.id}`} action={approveAction} className="flex-1">
          <input type="hidden" name="requestId" value={request.id} />
          <Button
            type="submit"
            size="sm"
            disabled={approvePending}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white border-transparent"
          >
            {approvePending ? 'Approving...' : 'Approve'}
          </Button>
        </form>

        {!showReject ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowReject(true)}
            className="flex-1 border-rose-300 text-rose-700 hover:bg-rose-50"
          >
            Reject
          </Button>
        ) : (
          <form id={`reject-form-${request.id}`} action={rejectAction} className="flex-1">
            <input type="hidden" name="requestId" value={request.id} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={rejectPending}
              className="w-full border-rose-300 text-rose-700 hover:bg-rose-50"
            >
              {rejectPending ? 'Rejecting...' : 'Confirm Reject'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

export function ApprovalList({ requests }: Props) {
  if (requests.length === 0) {
    return (
      <div className="rounded-xl bg-card p-12 text-center ring-1 ring-foreground/10">
        <p className="text-muted-foreground">No pending approvals.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {requests.map(r => (
        <ApprovalCard key={r.id} request={r} />
      ))}
    </div>
  )
}
