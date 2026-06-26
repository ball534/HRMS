'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { transitionRewardCycle } from '@/actions/rewards'
import { Button } from '@/components/ui/button'

const NEXT: Record<string, { to: 'APPROVED' | 'PAID' | 'CLOSED'; label: string } | null> = {
  DRAFT: { to: 'APPROVED', label: 'Approve all draft allocations' },
  APPROVED: { to: 'PAID', label: 'Mark as paid' },
  PAID: { to: 'CLOSED', label: 'Close cycle' },
  CLOSED: null,
}

type Props = {
  cycleId: string
  status: 'DRAFT' | 'APPROVED' | 'PAID' | 'CLOSED'
  hasAllocations: boolean
}

export function CycleTransitionControls({ cycleId, status, hasAllocations }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const next = NEXT[status]
  if (!next) return <p className="text-sm text-muted-foreground">Cycle is closed.</p>

  const disabled = pending || (status === 'DRAFT' && !hasAllocations)

  return (
    <div className="space-y-2">
      <Button
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const r = await transitionRewardCycle(cycleId, next.to)
            if (r.error) setError(r.error)
            else router.refresh()
          })
        }
        disabled={disabled}
      >
        {pending ? 'Working…' : next.label}
      </Button>
      {status === 'DRAFT' && !hasAllocations && (
        <p className="text-xs text-muted-foreground">
          Add at least one allocation before approving.
        </p>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  )
}
