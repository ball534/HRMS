'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertBlackout, deleteBlackout, type BlackoutActionState } from '@/actions/blackouts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pencil, Trash2 } from 'lucide-react'

type Blackout = {
  id: string
  name: string
  reason: string | null
  country: string | null
  startDate: string
  endDate: string
  hardBlock: boolean
}

const initialState: BlackoutActionState = {}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

export function BlackoutManager({ blackouts }: { blackouts: Blackout[] }) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(upsertBlackout, initialState)
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
      await deleteBlackout(id)
      setDeletingId(null)
      router.refresh()
    })
  }

  const editing = blackouts.find(b => b.id === editingId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Block leave during retail peak periods (CNY, Hari Raya, Deepavali, year-end sale).
        </p>
        {!showAdd && !editingId && (
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            + Add window
          </Button>
        )}
      </div>

      {(showAdd || editing) && (
        <div className="rounded-lg border border-border bg-card p-4">
          <BlackoutForm
            existing={editing ?? null}
            formAction={formAction}
            state={state}
            isPending={isPending}
            onCancel={() => { setShowAdd(false); setEditingId(null) }}
          />
        </div>
      )}

      {blackouts.length === 0 && !showAdd ? (
        <p className="text-sm text-muted-foreground">No blackouts defined.</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Country</th>
                <th className="px-4 py-3 font-medium">Window</th>
                <th className="px-4 py-3 font-medium">Mode</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {blackouts.map(b => (
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{b.name}</div>
                    {b.reason && <div className="text-xs text-muted-foreground">{b.reason}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{b.country ?? 'All'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {fmt(b.startDate)} → {fmt(b.endDate)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      b.hardBlock ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {b.hardBlock ? 'Hard block' : 'Warning only'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => { setEditingId(b.id); setShowAdd(false) }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(b.id)}
                        disabled={deletingId === b.id}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function BlackoutForm({
  existing,
  formAction,
  state,
  isPending,
  onCancel,
}: {
  existing: Blackout | null
  formAction: (formData: FormData) => void
  state: BlackoutActionState
  isPending: boolean
  onCancel: () => void
}) {
  return (
    <form action={formAction} className="space-y-4">
      {existing && <input type="hidden" name="id" value={existing.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name *</Label>
          <Input id="name" name="name" required defaultValue={existing?.name ?? ''}
            placeholder="e.g. CNY 2026 Peak"
            className="mt-1" />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <select id="country" name="country" defaultValue={existing?.country ?? 'ALL'}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none">
            <option value="ALL">All countries</option>
            <option value="SG">Singapore only</option>
            <option value="MY">Malaysia only</option>
          </select>
        </div>
        <div>
          <Label htmlFor="startDate">Start date *</Label>
          <Input id="startDate" name="startDate" type="date" required
            defaultValue={existing?.startDate?.slice(0, 10) ?? ''}
            className="mt-1" />
        </div>
        <div>
          <Label htmlFor="endDate">End date *</Label>
          <Input id="endDate" name="endDate" type="date" required
            defaultValue={existing?.endDate?.slice(0, 10) ?? ''}
            className="mt-1" />
        </div>
      </div>

      <div>
        <Label htmlFor="reason">Reason (optional)</Label>
        <Input id="reason" name="reason" defaultValue={existing?.reason ?? ''}
          placeholder="Internal note — appears in audit log"
          className="mt-1" />
      </div>

      <Label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="hardBlock" value="true"
          defaultChecked={existing?.hardBlock ?? true} />
        <span>Hard block — leave submissions during this window are rejected with an error.</span>
      </Label>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save window'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
