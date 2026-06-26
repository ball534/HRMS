'use client'

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertAllocation, cancelAllocation, type RewardActionState } from '@/actions/rewards'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Pencil, X, Plus } from 'lucide-react'

type Candidate = {
  id: string
  firstName: string
  lastName: string
  email: string
  country: string
  position: string | null
  department: string | null
  linkedReview: { id: string; overallRating: number | null } | null
}

type Allocation = {
  id: string
  employeeId: string
  bonusType: 'PERFORMANCE' | 'CONTRACTUAL_13TH' | 'AD_HOC'
  amount: string
  currency: string
  rationale: string | null
  status: 'DRAFT' | 'APPROVED' | 'PAID' | 'CANCELLED'
  linkedReviewId: string | null
  linkedReviewRating: number | null
  approver: { firstName: string; lastName: string } | null
  approvedAt: string | null
  paidAt: string | null
}

type Props = {
  cycleId: string
  cycleStatus: 'DRAFT' | 'APPROVED' | 'PAID' | 'CLOSED'
  currency: string
  candidates: Candidate[]
  allocations: Allocation[]
  ratingScale?: number | null
  ratingLabels?: string[] | null
}

const STATUS_PILL: Record<string, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  APPROVED: 'bg-blue-50 text-blue-700 border-blue-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
}

const BONUS_LABEL: Record<string, string> = {
  PERFORMANCE: 'Performance',
  CONTRACTUAL_13TH: '13th month',
  AD_HOC: 'Ad-hoc',
}

const initialState: RewardActionState = {}

export function AllocationManager({
  cycleId,
  cycleStatus,
  currency,
  candidates,
  allocations,
  ratingLabels,
}: Props) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(upsertAllocation, initialState)
  const [editing, setEditing] = useState<{ employeeId: string; allocationId?: string } | null>(null)
  const [, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  // Close form on successful save
  useEffect(() => {
    if (state.success) setEditing(null)
  }, [state.success])

  const allocByKey = useMemo(() => {
    const m = new Map<string, Allocation>()
    for (const a of allocations) {
      m.set(`${a.employeeId}:${a.bonusType}`, a)
    }
    return m
  }, [allocations])

  const editable = cycleStatus === 'DRAFT'
  const totalApproved = allocations
    .filter(a => a.status !== 'CANCELLED')
    .reduce((s, a) => s + Number(a.amount), 0)

  function getEmployee(id: string): Candidate | undefined {
    return candidates.find(c => c.id === id)
  }

  function handleCancel(allocId: string) {
    setPendingId(allocId)
    startTransition(async () => {
      const r = await cancelAllocation(allocId)
      setPendingId(null)
      if (!r.error) router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {allocations.filter(a => a.status !== 'CANCELLED').length} active allocation(s) ·{' '}
            <span className="font-semibold text-foreground">
              {currency} {totalApproved.toFixed(2)}
            </span>{' '}
            total
          </p>
        </div>
      </div>

      {!editable && (
        <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          Cycle is {cycleStatus}. Allocations are locked from editing.
        </p>
      )}

      {/* Editor — shown when adding/editing */}
      {editing && editable && (
        <div className="rounded-xl border border-border bg-background p-4">
          <AllocationForm
            cycleId={cycleId}
            currency={currency}
            employee={getEmployee(editing.employeeId)!}
            existing={
              editing.allocationId
                ? allocations.find(a => a.id === editing.allocationId) ?? null
                : null
            }
            ratingLabels={ratingLabels ?? null}
            formAction={formAction}
            state={state}
            isPending={isPending}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {/* Allocations table */}
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Bonus type</th>
              <th className="px-4 py-3 font-medium text-right">Amount</th>
              <th className="px-4 py-3 font-medium">Rating</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {allocations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No allocations yet. Pick an employee below to add one.
                </td>
              </tr>
            )}
            {allocations.map(a => {
              const emp = getEmployee(a.employeeId)
              const ratingTxt =
                a.linkedReviewRating !== null && ratingLabels
                  ? `${a.linkedReviewRating} — ${ratingLabels[a.linkedReviewRating - 1] ?? ''}`
                  : a.linkedReviewRating !== null
                  ? String(a.linkedReviewRating)
                  : '—'
              return (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {emp ? `${emp.firstName} ${emp.lastName}` : '—'}
                    </div>
                    {emp && <div className="text-xs text-muted-foreground">{emp.position ?? '—'}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{BONUS_LABEL[a.bonusType]}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {a.currency} {Number(a.amount).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{ratingTxt}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                        STATUS_PILL[a.status],
                      )}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.status === 'DRAFT' && editable && (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setEditing({ employeeId: a.employeeId, allocationId: a.id })}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleCancel(a.id)}
                          disabled={pendingId === a.id}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                          aria-label="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add-allocation employee picker — only candidates without an active allocation of the same bonusType */}
      {editable && !editing && (
        <details className="rounded-xl bg-card ring-1 ring-foreground/10">
          <summary className="cursor-pointer px-6 py-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            + Add allocation
          </summary>
          <ul className="divide-y divide-border">
            {candidates.map(c => {
              const hasPerf = allocByKey.has(`${c.id}:PERFORMANCE`)
              const ratingText =
                c.linkedReview?.overallRating !== null && c.linkedReview && ratingLabels
                  ? `Rating: ${c.linkedReview.overallRating} — ${ratingLabels[(c.linkedReview.overallRating ?? 1) - 1] ?? ''}`
                  : c.linkedReview
                  ? 'Review present, no rating yet'
                  : null
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 px-6 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {c.firstName} {c.lastName}
                      <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                        {c.country}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.position ?? '—'} · {c.department ?? '—'}
                      {ratingText && ` · ${ratingText}`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing({ employeeId: c.id })}
                    disabled={hasPerf}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {hasPerf ? 'Already allocated' : 'Allocate'}
                  </Button>
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </div>
  )
}

type FormProps = {
  cycleId: string
  currency: string
  employee: Candidate
  existing: Allocation | null
  ratingLabels: string[] | null
  formAction: (formData: FormData) => void
  state: RewardActionState
  isPending: boolean
  onCancel: () => void
}

function AllocationForm({
  cycleId,
  currency,
  employee,
  existing,
  ratingLabels,
  formAction,
  state,
  isPending,
  onCancel,
}: FormProps) {
  const review = employee.linkedReview
  const ratingHint =
    review?.overallRating !== null && review && ratingLabels
      ? `Rating: ${review.overallRating} — ${ratingLabels[(review.overallRating ?? 1) - 1] ?? ''}`
      : null

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="cycleId" value={cycleId} />
      <input type="hidden" name="employeeId" value={employee.id} />
      {existing && <input type="hidden" name="allocationId" value={existing.id} />}
      {review && <input type="hidden" name="linkedReviewId" value={review.id} />}

      <div>
        <p className="text-sm font-medium">
          {employee.firstName} {employee.lastName}
        </p>
        <p className="text-xs text-muted-foreground">
          {employee.position ?? '—'} · {employee.department ?? '—'} · {employee.country}
          {ratingHint && ` · ${ratingHint}`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="bonusType">Bonus type</Label>
          <select
            id="bonusType"
            name="bonusType"
            defaultValue={existing?.bonusType ?? 'PERFORMANCE'}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none"
          >
            <option value="PERFORMANCE">Performance</option>
            <option value="CONTRACTUAL_13TH">13th month / AWS</option>
            <option value="AD_HOC">Ad-hoc</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="amount">Amount ({currency}) *</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step="any"
            min={0}
            required
            defaultValue={existing ? Number(existing.amount).toFixed(2) : ''}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="rationale">Rationale</Label>
        <textarea
          id="rationale"
          name="rationale"
          rows={2}
          defaultValue={existing?.rationale ?? ''}
          placeholder="Why this amount? Useful for audit + future calibration."
          className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none"
        />
      </div>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save allocation'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
