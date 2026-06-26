'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { approveLeave, rejectLeave, cancelLeave, deleteLeave, type LeaveActionState } from '@/actions/leave'

type Props = {
  requestId: string
  canApproveReject: boolean
  canCancel: boolean
  isAdmin?: boolean
}

const initialState: LeaveActionState = {}

export function LeaveDetailActions({ requestId, canApproveReject, canCancel, isAdmin }: Props) {
  const router = useRouter()
  const [showRejectComment, setShowRejectComment] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, startDeleteTransition] = useTransition()

  const [approveState, approveAction, approvePending] = useActionState(approveLeave, initialState)
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectLeave, initialState)
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelLeave, initialState)

  // Redirect on success
  if (approveState.success || rejectState.success || cancelState.success) {
    router.refresh()
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteLeave(requestId)
      if (result.error) {
        setDeleteError(result.error)
      } else {
        router.push('/leave')
      }
    })
  }

  const errorMsg = approveState.error ?? rejectState.error ?? cancelState.error ?? deleteError

  return (
    <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10 space-y-4">
      {errorMsg && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {errorMsg}
        </div>
      )}

      {canApproveReject && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Approve or Reject
          </h2>

          {showRejectComment && (
            <div>
              <label htmlFor="comment" className="text-sm text-muted-foreground">
                Rejection reason (optional)
              </label>
              <textarea
                id="comment"
                name="comment"
                form="reject-form"
                rows={2}
                placeholder="Add a reason..."
                className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
              />
            </div>
          )}

          <div className="flex gap-3">
            <form id="approve-form" action={approveAction}>
              <input type="hidden" name="requestId" value={requestId} />
              <Button
                type="submit"
                disabled={approvePending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white border-transparent"
              >
                {approvePending ? 'Approving...' : 'Approve'}
              </Button>
            </form>

            {!showRejectComment ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowRejectComment(true)}
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                Reject
              </Button>
            ) : (
              <form id="reject-form" action={rejectAction}>
                <input type="hidden" name="requestId" value={requestId} />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={rejectPending}
                  className="border-rose-300 text-rose-700 hover:bg-rose-50"
                >
                  {rejectPending ? 'Rejecting...' : 'Confirm Reject'}
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {canCancel && (
        <div className={canApproveReject ? 'border-t border-border pt-4' : ''}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Cancel Request
          </h2>
          <form action={cancelAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <Button
              type="submit"
              variant="outline"
              disabled={cancelPending}
              className="border-zinc-300 text-zinc-700 hover:bg-zinc-100"
            >
              {cancelPending ? 'Cancelling...' : 'Cancel Request'}
            </Button>
          </form>
        </div>
      )}

      {isAdmin && (
        <div className={(canApproveReject || canCancel) ? 'border-t border-border pt-4' : ''}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Admin: Delete Request
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Permanently delete this leave request. Balance will be restored automatically.
          </p>
          {!showDeleteConfirm ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteConfirm(true)}
              className="border-rose-300 text-rose-700 hover:bg-rose-50"
            >
              Delete Request
            </Button>
          ) : (
            <div className="flex gap-3">
              <Button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-rose-600 hover:bg-rose-500 text-white border-transparent"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
