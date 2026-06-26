'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  saveTimeEntry,
  deleteTimeEntry,
  type TimeEntryActionState,
} from '@/actions/timeEntry'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type DialogEntry = {
  id?: string
  workDate: string // YYYY-MM-DD
  hoursWorked: number | null
  startTime: string | null // HH:MM
  endTime: string | null
  breakMinutes: number
  description: string | null
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'NEW'
  rejectionReason: string | null
  isPublicHoliday: boolean
  holidayName?: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: DialogEntry
  editable: boolean
}

const initialState: TimeEntryActionState = {}

const STATUS_PILL: Record<string, string> = {
  NEW: 'bg-zinc-100 text-zinc-600',
  DRAFT: 'bg-zinc-100 text-zinc-600',
  SUBMITTED: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-rose-50 text-rose-700',
}

const STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

export function TimeEntryDialog({ open, onOpenChange, entry, editable }: Props) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(saveTimeEntry, initialState)
  const [, startTransition] = useTransition()
  const [deletePending, setDeletePending] = useState(false)

  useEffect(() => {
    if (state.success) {
      onOpenChange(false)
      router.refresh()
    }
  }, [state.success, onOpenChange, router])

  function handleDelete() {
    if (!entry.id) return
    setDeletePending(true)
    startTransition(async () => {
      const r = await deleteTimeEntry(entry.id!)
      setDeletePending(false)
      if (!r.error) {
        onOpenChange(false)
        router.refresh()
      }
    })
  }

  const dateLabel = new Date(`${entry.workDate}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>{dateLabel}</DialogTitle>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[entry.status]}`}
            >
              {STATUS_LABEL[entry.status] ?? entry.status}
            </span>
          </div>
          <DialogDescription>
            {entry.isPublicHoliday ? (
              <span className="inline-flex items-center gap-1 text-rose-600">
                Public holiday{entry.holidayName ? ` — ${entry.holidayName}` : ''}. Hours worked are paid at 2× (3× over normal daily hours).
              </span>
            ) : (
              'Enter the hours you worked. Manager approves before payroll.'
            )}
          </DialogDescription>
        </DialogHeader>

        {entry.status === 'REJECTED' && entry.rejectionReason && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
            <p className="font-medium">Rejected</p>
            <p className="text-xs">{entry.rejectionReason}</p>
          </div>
        )}

        {editable ? (
          <form action={formAction} className="space-y-3">
            {entry.id && <input type="hidden" name="entryId" value={entry.id} />}
            <input type="hidden" name="workDate" value={entry.workDate} />

            <div>
              <Label htmlFor="hoursWorked">Hours worked *</Label>
              <Input
                id="hoursWorked"
                name="hoursWorked"
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                required
                defaultValue={entry.hoursWorked ?? ''}
                placeholder="e.g. 5"
                className="mt-1"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="startTime">Start (optional)</Label>
                <Input
                  id="startTime"
                  name="startTime"
                  type="time"
                  defaultValue={entry.startTime ?? ''}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="endTime">End (optional)</Label>
                <Input
                  id="endTime"
                  name="endTime"
                  type="time"
                  defaultValue={entry.endTime ?? ''}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="breakMinutes">Break (min)</Label>
                <Input
                  id="breakMinutes"
                  name="breakMinutes"
                  type="number"
                  min="0"
                  max="720"
                  defaultValue={entry.breakMinutes}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Note (optional)</Label>
              <textarea
                id="description"
                name="description"
                rows={2}
                defaultValue={entry.description ?? ''}
                placeholder="e.g. Covering Orchard store, morning shift"
                className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none"
              />
            </div>

            {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

            <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
              {entry.id ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deletePending || isPending}
                  className="border-rose-300 text-rose-700 hover:bg-rose-50"
                >
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isPending}>
                  {isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hours worked</span>
              <span className="font-medium">{entry.hoursWorked ?? '—'}</span>
            </div>
            {(entry.startTime || entry.endTime) && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Window</span>
                <span>
                  {entry.startTime ?? '—'} → {entry.endTime ?? '—'}
                </span>
              </div>
            )}
            {entry.breakMinutes > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Break</span>
                <span>{entry.breakMinutes} min</span>
              </div>
            )}
            {entry.description && (
              <div>
                <span className="text-muted-foreground">Note</span>
                <p className="mt-1 whitespace-pre-wrap">{entry.description}</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
