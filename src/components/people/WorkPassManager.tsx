'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertWorkPass, deleteWorkPass, type WorkPassActionState } from '@/actions/workPass'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type WorkPass = {
  id: string
  passType: string
  passNumber: string | null
  issueDate: string | null
  expiryDate: string | null
  levy: string | null
  notes: string | null
}

type Props = {
  userId: string
  passes: WorkPass[]
}

const PASS_TYPE_LABEL: Record<string, string> = {
  NONE: 'None (citizen / PR)',
  SG_WORK_PERMIT: 'SG · Work Permit (WP)',
  SG_S_PASS: 'SG · S Pass',
  SG_EMPLOYMENT_PASS: 'SG · Employment Pass',
  SG_DEPENDANT_PASS: 'SG · Dependant Pass + LOC',
  SG_LTVP_PLUS: 'SG · LTVP+ + LOC',
  MY_WORK_PERMIT: 'MY · Work Permit',
  MY_EMPLOYMENT_PASS: 'MY · Employment Pass',
  MY_DEPENDANT_PASS: 'MY · Dependant Pass',
  OTHER: 'Other',
}

const initialState: WorkPassActionState = {}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function daysUntil(d: string | null): number | null {
  if (!d) return null
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setUTCHours(0, 0, 0, 0)
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function expiryPill(d: string | null) {
  const days = daysUntil(d)
  if (days === null) return { label: 'No expiry', cls: 'bg-zinc-100 text-zinc-600' }
  if (days < 0) return { label: `Expired ${-days}d ago`, cls: 'bg-rose-50 text-rose-700' }
  if (days <= 30) return { label: `${days}d left`, cls: 'bg-rose-50 text-rose-700' }
  if (days <= 60) return { label: `${days}d left`, cls: 'bg-amber-50 text-amber-700' }
  if (days <= 90) return { label: `${days}d left`, cls: 'bg-blue-50 text-blue-700' }
  return { label: `${days}d left`, cls: 'bg-emerald-50 text-emerald-700' }
}

export function WorkPassManager({ userId, passes }: Props) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(upsertWorkPass, initialState)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (state.success) {
      setEditingId(null)
      setShowAdd(false)
    }
  }, [state.success])

  function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      await deleteWorkPass(id)
      setDeletingId(null)
      router.refresh()
    })
  }

  const editing = passes.find(p => p.id === editingId)

  return (
    <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Work passes
        </h2>
        {!showAdd && !editingId && (
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            + Add pass
          </Button>
        )}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Track foreign-worker permits, S Pass, Employment Pass etc. The system alerts on upcoming
        expiries (90/60/30 days out).
      </p>

      {(showAdd || editing) && (
        <div className="mb-4 rounded-lg border border-border bg-background p-4">
          <PassForm
            userId={userId}
            existing={editing ?? null}
            formAction={formAction}
            state={state}
            isPending={isPending}
            onCancel={() => {
              setShowAdd(false)
              setEditingId(null)
            }}
          />
        </div>
      )}

      {passes.length === 0 && !showAdd ? (
        <p className="text-sm text-muted-foreground">
          No work passes recorded. Add one if this employee is on a foreign work permit.
        </p>
      ) : (
        <ul className="space-y-2">
          {passes.map(p => {
            const pill = expiryPill(p.expiryDate)
            return (
              <li key={p.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {PASS_TYPE_LABEL[p.passType] ?? p.passType}
                      </span>
                      {p.passNumber && (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {p.passNumber}
                        </span>
                      )}
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', pill.cls)}>
                        {pill.label}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Issued {fmt(p.issueDate)} → expires {fmt(p.expiryDate)}
                      {p.levy && ` · levy ${Number(p.levy).toFixed(2)}/month`}
                    </div>
                    {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => {
                        setEditingId(p.id)
                        setShowAdd(false)
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

type FormProps = {
  userId: string
  existing: WorkPass | null
  formAction: (formData: FormData) => void
  state: WorkPassActionState
  isPending: boolean
  onCancel: () => void
}

function PassForm({ userId, existing, formAction, state, isPending, onCancel }: FormProps) {
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      {existing && <input type="hidden" name="passId" value={existing.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="passType">Pass type *</Label>
          <select
            id="passType"
            name="passType"
            required
            defaultValue={existing?.passType ?? ''}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none"
          >
            <option value="">Choose…</option>
            <option value="NONE">None (citizen / PR)</option>
            <optgroup label="Singapore">
              <option value="SG_WORK_PERMIT">SG · Work Permit (WP)</option>
              <option value="SG_S_PASS">SG · S Pass</option>
              <option value="SG_EMPLOYMENT_PASS">SG · Employment Pass</option>
              <option value="SG_DEPENDANT_PASS">SG · Dependant Pass + LOC</option>
              <option value="SG_LTVP_PLUS">SG · LTVP+ + LOC</option>
            </optgroup>
            <optgroup label="Malaysia">
              <option value="MY_WORK_PERMIT">MY · Work Permit</option>
              <option value="MY_EMPLOYMENT_PASS">MY · Employment Pass</option>
              <option value="MY_DEPENDANT_PASS">MY · Dependant Pass</option>
            </optgroup>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <Label htmlFor="passNumber">Pass / FIN number</Label>
          <Input
            id="passNumber"
            name="passNumber"
            defaultValue={existing?.passNumber ?? ''}
            placeholder="e.g. G1234567A"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="issueDate">Issue date</Label>
          <Input
            id="issueDate"
            name="issueDate"
            type="date"
            defaultValue={existing?.issueDate ? existing.issueDate.slice(0, 10) : ''}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="expiryDate">Expiry date</Label>
          <Input
            id="expiryDate"
            name="expiryDate"
            type="date"
            defaultValue={existing?.expiryDate ? existing.expiryDate.slice(0, 10) : ''}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="levy">Monthly levy (optional)</Label>
          <Input
            id="levy"
            name="levy"
            type="number"
            step="any"
            min={0}
            defaultValue={existing?.levy ?? ''}
            placeholder="SGD per month"
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={existing?.notes ?? ''}
          placeholder="Quota number, dependant ratio, anything to flag at renewal"
          className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none"
        />
      </div>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save pass'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
