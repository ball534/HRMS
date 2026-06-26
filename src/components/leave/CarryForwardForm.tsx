'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { runCarryForward, type CarryForwardState } from '@/actions/leaveBalance'

const initialState: CarryForwardState = {}

const currentYear = new Date().getFullYear()

export function CarryForwardForm() {
  const [state, formAction, isPending] = useActionState(runCarryForward, initialState)

  return (
    <form action={formAction} className="space-y-4">
      {state.success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          Carry-forward complete. {state.processed} employee{(state.processed ?? 0) !== 1 ? 's' : ''} processed.
        </div>
      )}
      {state.error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      )}

      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
        <p className="font-medium">Important:</p>
        <p>Resolve all pending leave requests before running carry-forward. Pending leave is excluded from the carry-forward calculation. Max 5 days carried per employee.</p>
      </div>

      <div className="flex items-end gap-4">
        <div>
          <Label htmlFor="year">Carry INTO year *</Label>
          <select
            id="year"
            name="year"
            defaultValue={currentYear + 1}
            className="mt-1 h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            <option value={currentYear}>{currentYear}</option>
            <option value={currentYear + 1}>{currentYear + 1}</option>
          </select>
        </div>
        <Button type="submit" disabled={isPending} variant="outline">
          {isPending ? 'Processing...' : 'Run Carry-Forward'}
        </Button>
      </div>
    </form>
  )
}
