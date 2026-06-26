'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { evaluateGoal, type ReviewActionState } from '@/actions/performance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Goal = {
  id: string
  title: string
  description: string | null
  goalType: 'QUALITATIVE' | 'QUANTITATIVE'
  targetValue: string | number | null
  actualValue: string | number | null
  unit: string | null
  outcome: 'NOT_EVALUATED' | 'MISSED' | 'PARTIAL' | 'MET' | 'EXCEEDED'
  managerComment: string | null
}

const OUTCOME_PILL: Record<string, string> = {
  NOT_EVALUATED: 'bg-zinc-100 text-zinc-600',
  MISSED: 'bg-rose-50 text-rose-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  MET: 'bg-blue-50 text-blue-700',
  EXCEEDED: 'bg-emerald-50 text-emerald-700',
}

const OUTCOME_LABEL: Record<string, string> = {
  NOT_EVALUATED: 'Not evaluated',
  MISSED: 'Missed',
  PARTIAL: 'Partial',
  MET: 'Met',
  EXCEEDED: 'Exceeded',
}

export function GoalEvaluator({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) {
    return <p className="text-sm text-muted-foreground">No goals were set for this cycle.</p>
  }

  return (
    <ul className="space-y-3">
      {goals.map((g) => (
        <GoalEvaluationRow key={g.id} goal={g} />
      ))}
    </ul>
  )
}

function GoalEvaluationRow({ goal }: { goal: Goal }) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(evaluateGoal, {} as ReviewActionState)
  const [outcome, setOutcome] = useState(goal.outcome === 'NOT_EVALUATED' ? '' : goal.outcome)

  useEffect(() => {
    if (state.success) router.refresh()
  }, [state.success, router])

  return (
    <li className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{goal.title}</h3>
            {goal.goalType === 'QUANTITATIVE' && goal.targetValue !== null && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Target: {String(goal.targetValue)} {goal.unit ?? ''}
              </span>
            )}
          </div>
          {goal.description && (
            <p className="mt-1 text-sm text-muted-foreground">{goal.description}</p>
          )}
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            OUTCOME_PILL[goal.outcome],
          )}
        >
          {OUTCOME_LABEL[goal.outcome]}
        </span>
      </div>

      <form action={formAction} className="space-y-3 border-t border-border pt-3">
        <input type="hidden" name="goalId" value={goal.id} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`outcome-${goal.id}`}>Outcome *</Label>
            <select
              id={`outcome-${goal.id}`}
              name="outcome"
              required
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as typeof outcome)}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none"
            >
              <option value="">Choose…</option>
              <option value="MISSED">Missed</option>
              <option value="PARTIAL">Partial</option>
              <option value="MET">Met</option>
              <option value="EXCEEDED">Exceeded</option>
            </select>
          </div>
          {goal.goalType === 'QUANTITATIVE' && (
            <div>
              <Label htmlFor={`actual-${goal.id}`}>Actual value</Label>
              <Input
                id={`actual-${goal.id}`}
                name="actualValue"
                type="number"
                step="any"
                defaultValue={goal.actualValue !== null && goal.actualValue !== undefined ? String(goal.actualValue) : ''}
                placeholder={goal.unit ? `Value in ${goal.unit}` : 'Actual value'}
                className="mt-1"
              />
            </div>
          )}
        </div>

        <div>
          <Label htmlFor={`comment-${goal.id}`}>Comment</Label>
          <textarea
            id={`comment-${goal.id}`}
            name="managerComment"
            rows={2}
            defaultValue={goal.managerComment ?? ''}
            placeholder="What did the employee do well? What could be better?"
            className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none"
          />
        </div>

        {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

        <div>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? 'Saving…' : goal.outcome === 'NOT_EVALUATED' ? 'Save evaluation' : 'Update evaluation'}
          </Button>
        </div>
      </form>
    </li>
  )
}
