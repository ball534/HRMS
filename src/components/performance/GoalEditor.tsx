'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertGoal, deleteGoal, type ReviewActionState } from '@/actions/performance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2, Pencil } from 'lucide-react'

type Goal = {
  id: string
  title: string
  description: string | null
  goalType: 'QUALITATIVE' | 'QUANTITATIVE'
  targetValue: string | number | null
  unit: string | null
  weight: number | null
}

type Props = {
  reviewId: string
  goals: Goal[]
  weightsEnabled: boolean
  maxGoals: number
}

const initialState: ReviewActionState = {}

export function GoalEditor({ reviewId, goals, weightsEnabled, maxGoals }: Props) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(upsertGoal, initialState)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Close the form after a successful save
  useEffect(() => {
    if (state.success) {
      setEditingId(null)
      setShowAdd(false)
    }
  }, [state.success])

  function handleDelete(goalId: string) {
    setDeletingId(goalId)
    startTransition(async () => {
      const r = await deleteGoal(goalId)
      setDeletingId(null)
      if (!r.error) router.refresh()
    })
  }

  const canAdd = goals.length < maxGoals && !showAdd && !editingId
  const atLimit = goals.length >= maxGoals

  return (
    <div className="space-y-4">
      {goals.length === 0 && !showAdd && (
        <p className="text-sm text-muted-foreground">
          No goals yet. Add 3–{maxGoals} SMART goals for this cycle.
        </p>
      )}

      <ul className="space-y-3">
        {goals.map((g) => (
          <li key={g.id} className="rounded-lg border border-border bg-background p-4">
            {editingId === g.id ? (
              <GoalForm
                reviewId={reviewId}
                goal={g}
                weightsEnabled={weightsEnabled}
                formAction={formAction}
                state={state}
                isPending={isPending}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{g.title}</h3>
                    {g.goalType === 'QUANTITATIVE' && g.targetValue !== null && (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Target: {String(g.targetValue)} {g.unit ?? ''}
                      </span>
                    )}
                    {weightsEnabled && g.weight !== null && (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {g.weight}%
                      </span>
                    )}
                  </div>
                  {g.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{g.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setEditingId(g.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Edit goal"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(g.id)}
                    disabled={deletingId === g.id}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                    aria-label="Delete goal"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {showAdd && (
        <div className="rounded-lg border border-border bg-background p-4">
          <GoalForm
            reviewId={reviewId}
            weightsEnabled={weightsEnabled}
            formAction={formAction}
            state={state}
            isPending={isPending}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {canAdd && (
        <Button variant="outline" onClick={() => setShowAdd(true)}>
          + Add goal
        </Button>
      )}
      {atLimit && !editingId && (
        <p className="text-xs text-muted-foreground">
          Maximum {maxGoals} goals reached. Delete one to add more.
        </p>
      )}
    </div>
  )
}

type FormProps = {
  reviewId: string
  goal?: Goal
  weightsEnabled: boolean
  formAction: (formData: FormData) => void
  state: ReviewActionState
  isPending: boolean
  onCancel: () => void
}

function GoalForm({ reviewId, goal, weightsEnabled, formAction, state, isPending, onCancel }: FormProps) {
  const [goalType, setGoalType] = useState<'QUALITATIVE' | 'QUANTITATIVE'>(
    goal?.goalType ?? 'QUALITATIVE',
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="reviewId" value={reviewId} />
      {goal && <input type="hidden" name="goalId" value={goal.id} />}

      <div>
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          name="title"
          required
          defaultValue={goal?.title ?? ''}
          placeholder="e.g. Hit Q2 sales target for Orchard store"
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="description">Description / context</Label>
        <textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={goal?.description ?? ''}
          placeholder="Why this matters, how it'll be measured"
          className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="goalType">Type</Label>
          <select
            id="goalType"
            name="goalType"
            value={goalType}
            onChange={(e) => setGoalType(e.target.value as 'QUALITATIVE' | 'QUANTITATIVE')}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none"
          >
            <option value="QUALITATIVE">Qualitative</option>
            <option value="QUANTITATIVE">Quantitative</option>
          </select>
        </div>
        {goalType === 'QUANTITATIVE' && (
          <>
            <div>
              <Label htmlFor="targetValue">Target value</Label>
              <Input
                id="targetValue"
                name="targetValue"
                type="number"
                step="any"
                defaultValue={goal?.targetValue !== null && goal?.targetValue !== undefined ? String(goal.targetValue) : ''}
                placeholder="e.g. 50000"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                name="unit"
                defaultValue={goal?.unit ?? ''}
                placeholder="e.g. RM, units, %"
                className="mt-1"
              />
            </div>
          </>
        )}
        {weightsEnabled && (
          <div>
            <Label htmlFor="weight">Weight (%)</Label>
            <Input
              id="weight"
              name="weight"
              type="number"
              min={0}
              max={100}
              defaultValue={goal?.weight ?? ''}
              className="mt-1"
            />
          </div>
        )}
      </div>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending} size="sm">
          {isPending ? 'Saving…' : 'Save goal'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
