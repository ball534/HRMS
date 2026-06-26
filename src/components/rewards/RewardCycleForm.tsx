'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createRewardCycle, type RewardActionState } from '@/actions/rewards'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type ReviewCycleOption = {
  id: string
  name: string
  status: string
}

type Props = {
  reviewCycles: ReviewCycleOption[]
}

const initialState: RewardActionState = {}

function FieldError({ errors, name }: { errors?: Record<string, string[]>; name: string }) {
  const msgs = errors?.[name]
  if (!msgs?.length) return null
  return <p className="mt-0.5 text-xs text-rose-600">{msgs[0]}</p>
}

export function RewardCycleForm({ reviewCycles }: Props) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(createRewardCycle, initialState)

  useEffect(() => {
    if (state.success && state.cycleId) {
      router.push(`/rewards/cycles/${state.cycleId}`)
    }
  }, [state.success, state.cycleId, router])

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      )}

      <div>
        <Label htmlFor="name">Cycle name *</Label>
        <Input
          id="name"
          name="name"
          required
          placeholder="e.g. FY2026 Performance Bonus, Hari Raya 2026"
          className="mt-1"
        />
        <FieldError errors={state.errors} name="name" />
      </div>

      <div>
        <Label htmlFor="description">Description (optional)</Label>
        <textarea
          id="description"
          name="description"
          rows={2}
          placeholder="Internal note for HR — eligibility, framing, etc."
          className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none"
        />
      </div>

      <div>
        <Label htmlFor="reviewCycleId">Linked performance cycle (optional)</Label>
        <select
          id="reviewCycleId"
          name="reviewCycleId"
          defaultValue=""
          className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none"
        >
          <option value="">None (ad-hoc / contractual)</option>
          {reviewCycles.map(rc => (
            <option key={rc.id} value={rc.id}>
              {rc.name} ({rc.status})
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          When linked, the allocation form shows each employee&apos;s overall rating for context.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="currency">Currency *</Label>
          <select
            id="currency"
            name="currency"
            defaultValue="MYR"
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none"
          >
            <option value="MYR">MYR</option>
            <option value="SGD">SGD</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div>
          <Label htmlFor="totalPoolAmount">Total pool (optional)</Label>
          <Input
            id="totalPoolAmount"
            name="totalPoolAmount"
            type="number"
            step="any"
            min={0}
            className="mt-1"
            placeholder="For budgeting — informational only"
          />
        </div>
        <div>
          <Label htmlFor="payoutDate">Payout date (optional)</Label>
          <Input id="payoutDate" name="payoutDate" type="date" className="mt-1" />
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Creating…' : 'Create cycle'}
        </Button>
      </div>
    </form>
  )
}
