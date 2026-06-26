'use client'

import { useActionState, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createReviewCycle, type ReviewActionState } from '@/actions/performance'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const initialState: ReviewActionState = {}

function FieldError({ errors, name }: { errors?: Record<string, string[]>; name: string }) {
  const msgs = errors?.[name]
  if (!msgs?.length) return null
  return <p className="mt-0.5 text-xs text-rose-600">{msgs[0]}</p>
}

const TEMPLATE_DEFAULTS: Record<
  'FULL' | 'LITE' | 'PROBATION',
  { ratingScale: number; ratingLabels: string[]; minGoals: number; maxGoals: number }
> = {
  FULL: {
    ratingScale: 5,
    ratingLabels: ['Below', 'Approaching', 'Meets', 'Exceeds', 'Outstanding'],
    minGoals: 3,
    maxGoals: 7,
  },
  LITE: {
    ratingScale: 3,
    ratingLabels: ['Below', 'Meets', 'Exceeds'],
    minGoals: 0,
    maxGoals: 0,
  },
  PROBATION: {
    ratingScale: 0,
    ratingLabels: [],
    minGoals: 0,
    maxGoals: 0,
  },
}

export function ReviewCycleForm() {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(createReviewCycle, initialState)
  const [template, setTemplate] = useState<'FULL' | 'LITE' | 'PROBATION'>('FULL')
  const [labels, setLabels] = useState<string>(TEMPLATE_DEFAULTS.FULL.ratingLabels.join(', '))
  const [ratingScale, setRatingScale] = useState<number>(TEMPLATE_DEFAULTS.FULL.ratingScale)
  const [minGoals, setMinGoals] = useState<number>(TEMPLATE_DEFAULTS.FULL.minGoals)
  const [maxGoals, setMaxGoals] = useState<number>(TEMPLATE_DEFAULTS.FULL.maxGoals)
  const [includeSalesTarget, setIncludeSalesTarget] = useState(false)

  useEffect(() => {
    if (state.success && state.cycleId) {
      router.push(`/performance/cycles/${state.cycleId}`)
    }
  }, [state.success, state.cycleId, router])

  function applyTemplate(t: 'FULL' | 'LITE' | 'PROBATION') {
    setTemplate(t)
    const defaults = TEMPLATE_DEFAULTS[t]
    setRatingScale(defaults.ratingScale)
    setLabels(defaults.ratingLabels.join(', '))
    setMinGoals(defaults.minGoals)
    setMaxGoals(defaults.maxGoals)
  }

  // Compute the JSON-string labels payload from comma-separated input
  const labelsAsJson = JSON.stringify(
    labels.split(',').map(s => s.trim()).filter(Boolean),
  )

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      )}

      {/* Basics */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Cycle basics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="name">Cycle name *</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g. FY2026 Annual Review or Q2 2026 Check-in"
              className="mt-1"
            />
            <FieldError errors={state.errors} name="name" />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="templateType">Template *</Label>
            <select
              id="templateType"
              name="templateType"
              value={template}
              onChange={e => applyTemplate(e.target.value as 'FULL' | 'LITE' | 'PROBATION')}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none"
            >
              <option value="FULL">Full review — goals + rating + narrative (employees, managers, HQ)</option>
              <option value="LITE">Lite — behavioural rating only (part-time / casual)</option>
              <option value="PROBATION">Probation — confirmation decision (no rating, no goals)</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Template controls which fields appear. Defaults below adjust automatically — you can still override.
            </p>
          </div>

          <div>
            <Label htmlFor="startDate">Cycle start *</Label>
            <Input id="startDate" name="startDate" type="date" className="mt-1" />
            <FieldError errors={state.errors} name="startDate" />
          </div>
          <div>
            <Label htmlFor="endDate">Cycle end *</Label>
            <Input id="endDate" name="endDate" type="date" className="mt-1" />
            <FieldError errors={state.errors} name="endDate" />
          </div>
          <div>
            <Label htmlFor="goalSettingDeadline">Goal-setting deadline</Label>
            <Input id="goalSettingDeadline" name="goalSettingDeadline" type="date" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="evaluationDeadline">Evaluation deadline</Label>
            <Input id="evaluationDeadline" name="evaluationDeadline" type="date" className="mt-1" />
          </div>
        </div>
      </div>

      {/* Rating (skipped for PROBATION) */}
      {template !== 'PROBATION' && (
        <div>
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Rating scale
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ratingScale">Number of levels</Label>
              <Input
                id="ratingScale"
                name="ratingScale"
                type="number"
                min={2}
                max={10}
                value={ratingScale}
                onChange={e => setRatingScale(Number(e.target.value))}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {template === 'FULL' ? 'Recommended: 5' : 'Recommended: 3'}
              </p>
            </div>
            <div>
              <Label htmlFor="ratingLabelsInput">Labels (comma separated)</Label>
              <Input
                id="ratingLabelsInput"
                value={labels}
                onChange={e => setLabels(e.target.value)}
                className="mt-1"
              />
              <input type="hidden" name="ratingLabels" value={labelsAsJson} />
              <p className="mt-1 text-xs text-muted-foreground">
                Must match number of levels above.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Goals (skipped for LITE and PROBATION) */}
      {template === 'FULL' && (
        <div>
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Goals
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="minGoals">Minimum goals</Label>
              <Input
                id="minGoals"
                name="minGoals"
                type="number"
                min={0}
                max={20}
                value={minGoals}
                onChange={e => setMinGoals(Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="maxGoals">Maximum goals</Label>
              <Input
                id="maxGoals"
                name="maxGoals"
                type="number"
                min={1}
                max={20}
                value={maxGoals}
                onChange={e => setMaxGoals(Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="flex items-center gap-2 pt-6">
                <input type="checkbox" name="goalWeightsEnabled" value="true" />
                <span>Enable goal weights (%)</span>
              </Label>
            </div>
          </div>
        </div>
      )}

      {/* Flow toggles */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Flow toggles
        </h2>
        <div className="space-y-2 text-sm">
          {template === 'FULL' && (
            <Label className="flex items-center gap-2">
              <input type="checkbox" name="employeeSelfAssessment" value="true" />
              <span>Allow employee self-assessment before manager evaluates</span>
            </Label>
          )}
          <Label className="flex items-center gap-2">
            <input type="checkbox" name="employeeCanComment" value="true" defaultChecked />
            <span>Allow employee to write a comment when acknowledging</span>
          </Label>
          {template !== 'PROBATION' && (
            <Label className="flex items-center gap-2">
              <input type="checkbox" name="requireManagerNarrative" value="true" defaultChecked />
              <span>Require manager narrative on submit</span>
            </Label>
          )}
        </div>
      </div>

      {/* Retail extras */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Retail extras
        </h2>
        <div className="space-y-2 text-sm">
          <Label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="includeSalesTarget"
              value="true"
              checked={includeSalesTarget}
              onChange={e => setIncludeSalesTarget(e.target.checked)}
            />
            <span>Include sales-target field (manager enters target + actual)</span>
          </Label>
          {includeSalesTarget && (
            <div className="ml-6 max-w-xs">
              <Label htmlFor="targetCurrency">Target currency</Label>
              <select
                id="targetCurrency"
                name="targetCurrency"
                defaultValue="MYR"
                className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none"
              >
                <option value="MYR">MYR</option>
                <option value="SGD">SGD</option>
                <option value="USD">USD</option>
              </select>
            </div>
          )}
          <Label className="flex items-center gap-2">
            <input type="checkbox" name="includeAttendanceMetric" value="true" />
            <span>Include attendance metric (days worked / scheduled)</span>
          </Label>
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
