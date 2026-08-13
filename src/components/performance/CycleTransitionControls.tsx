'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { transitionCycle } from '@/actions/performance'
import { Button } from '@/components/ui/button'
import { ReversalDialog } from '@/components/shared/ReversalDialog'

const NEXT_STATE: Record<string, { to: 'ACTIVE' | 'EVALUATION' | 'CLOSED'; label: string } | null> = {
  DRAFT: { to: 'ACTIVE', label: 'Open cycle (start goal-setting)' },
  ACTIVE: { to: 'EVALUATION', label: 'Move to evaluation' },
  EVALUATION: { to: 'CLOSED', label: 'Close cycle' },
  CLOSED: null,
}

type Props = {
  cycleId: string
  status: string
}

export function CycleTransitionControls({ cycleId, status }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const next = NEXT_STATE[status]
  if (!next) {
    // CLOSED used to be permanently terminal: a cycle closed a week early by
    // mis-click meant late reviews, corrections and appeals were all
    // impossible, and the only workaround was a duplicate cycle that split the
    // year's history in two.
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Cycle is closed. Reopening moves it back to evaluation so outstanding
          reviews, corrections and appeals can be completed.
        </p>
        <ReversalDialog
          entityType="REVIEW_CYCLE"
          entityId={cycleId}
          to="EVALUATION"
          actionLabel="Reopen cycle"
          description="Moves this cycle from CLOSED back to EVALUATION. Managers can submit outstanding reviews and corrections again."
          revalidate={[`/performance/cycles/${cycleId}`, '/performance/cycles']}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await transitionCycle(cycleId, next.to)
            if (result.error) setError(result.error)
            else router.refresh()
          })
        }
        disabled={pending}
      >
        {pending ? 'Working…' : next.label}
      </Button>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  )
}
