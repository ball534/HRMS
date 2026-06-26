'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { acknowledgeReview, type ReviewActionState } from '@/actions/performance'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Props = {
  reviewId: string
  allowComment: boolean
}

const initialState: ReviewActionState = {}

export function AcknowledgeForm({ reviewId, allowComment }: Props) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(acknowledgeReview, initialState)

  useEffect(() => {
    if (state.success) router.refresh()
  }, [state.success, router])

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reviewId" value={reviewId} />

      {allowComment && (
        <div>
          <Label htmlFor="comment">Your comment (optional)</Label>
          <textarea
            id="comment"
            name="comment"
            rows={3}
            placeholder="Anything you want to add to the record — agreement, disagreement, context."
            className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none"
          />
        </div>
      )}

      {state.error && (
        <p className="text-sm text-rose-600">{state.error}</p>
      )}

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Acknowledging…' : 'Acknowledge review'}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Acknowledging locks the review. Reach out to your manager or HR if you need a correction before signing off.
        </p>
      </div>
    </form>
  )
}
