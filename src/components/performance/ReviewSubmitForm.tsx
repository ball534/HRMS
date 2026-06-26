'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { submitReview, type ReviewActionState } from '@/actions/performance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  reviewId: string
  templateType: 'FULL' | 'LITE' | 'PROBATION'
  ratingScale: number
  ratingLabels: string[]
  includeSalesTarget: boolean
  targetCurrency: string | null
  includeAttendanceMetric: boolean
  requireManagerNarrative: boolean
  existing: {
    overallRating: number | null
    managerNarrative: string | null
    salesTargetAmount: string | number | null
    salesActualAmount: string | number | null
    attendanceDaysWorked: number | null
    attendanceDaysScheduled: number | null
    promotionReady: boolean | null
    probationDecision: 'CONFIRMED' | 'EXTENDED' | 'NOT_CONFIRMED' | null
  }
}

const initialState: ReviewActionState = {}

export function ReviewSubmitForm({
  reviewId,
  templateType,
  ratingScale,
  ratingLabels,
  includeSalesTarget,
  targetCurrency,
  includeAttendanceMetric,
  requireManagerNarrative,
  existing,
}: Props) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(submitReview, initialState)

  useEffect(() => {
    if (state.success) router.refresh()
  }, [state.success, router])

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="reviewId" value={reviewId} />

      {templateType === 'PROBATION' ? (
        <div>
          <Label htmlFor="probationDecision">Probation decision *</Label>
          <select
            id="probationDecision"
            name="probationDecision"
            required
            defaultValue={existing.probationDecision ?? ''}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none"
          >
            <option value="">Choose…</option>
            <option value="CONFIRMED">Confirmed — pass probation</option>
            <option value="EXTENDED">Extended — additional probation period</option>
            <option value="NOT_CONFIRMED">Not confirmed — terminate</option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            This decision is legally meaningful in Malaysia — a confirmation letter must follow.
          </p>
        </div>
      ) : (
        <div>
          <Label htmlFor="overallRating">Overall rating *</Label>
          <select
            id="overallRating"
            name="overallRating"
            required
            defaultValue={existing.overallRating ?? ''}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none"
          >
            <option value="">Choose…</option>
            {Array.from({ length: ratingScale }, (_, i) => i + 1).map((level) => (
              <option key={level} value={level}>
                {level} — {ratingLabels[level - 1] ?? `Level ${level}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {templateType !== 'PROBATION' && (
        <div>
          <Label htmlFor="managerNarrative">
            Manager narrative {requireManagerNarrative && '*'}
          </Label>
          <textarea
            id="managerNarrative"
            name="managerNarrative"
            rows={5}
            required={requireManagerNarrative}
            defaultValue={existing.managerNarrative ?? ''}
            placeholder="Summarise the employee's performance this cycle. What did they do well? Where can they grow?"
            className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none"
          />
        </div>
      )}

      {templateType === 'PROBATION' && (
        <div>
          <Label htmlFor="managerNarrative">Manager notes</Label>
          <textarea
            id="managerNarrative"
            name="managerNarrative"
            rows={4}
            defaultValue={existing.managerNarrative ?? ''}
            placeholder="Rationale for the probation decision."
            className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none"
          />
        </div>
      )}

      {includeSalesTarget && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Sales target ({targetCurrency ?? 'MYR'})</Label>
            <p className="mt-1 text-sm text-foreground">
              {existing.salesTargetAmount !== null && existing.salesTargetAmount !== undefined
                ? String(existing.salesTargetAmount)
                : 'Not set'}
            </p>
          </div>
          <div>
            <Label htmlFor="salesActualAmount">Sales actual ({targetCurrency ?? 'MYR'})</Label>
            <Input
              id="salesActualAmount"
              name="salesActualAmount"
              type="number"
              step="any"
              defaultValue={existing.salesActualAmount !== null && existing.salesActualAmount !== undefined ? String(existing.salesActualAmount) : ''}
              className="mt-1"
            />
          </div>
        </div>
      )}

      {includeAttendanceMetric && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="attendanceDaysWorked">Days worked</Label>
            <Input
              id="attendanceDaysWorked"
              name="attendanceDaysWorked"
              type="number"
              min={0}
              defaultValue={existing.attendanceDaysWorked ?? ''}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="attendanceDaysScheduled">Days scheduled</Label>
            <Input
              id="attendanceDaysScheduled"
              name="attendanceDaysScheduled"
              type="number"
              min={0}
              defaultValue={existing.attendanceDaysScheduled ?? ''}
              className="mt-1"
            />
          </div>
        </div>
      )}

      {templateType === 'LITE' && (
        <div>
          <Label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="promotionReady"
              value="true"
              defaultChecked={existing.promotionReady ?? false}
            />
            <span>Promotion-ready — recommend for conversion to full-time</span>
          </Label>
        </div>
      )}

      {state.error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Submitting…' : 'Submit review'}
        </Button>
      </div>
    </form>
  )
}
