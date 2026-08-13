'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RotateCcw } from 'lucide-react'
import { reverseRecordState } from '@/actions/reversal'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const MIN_REASON_LENGTH = 10

type Props = {
  entityType:
    | 'LEAVE'
    | 'EXPENSE'
    | 'TIME_ENTRY'
    | 'REVIEW_CYCLE'
    | 'PERFORMANCE_REVIEW'
    | 'REWARD_CYCLE'
    | 'REWARD_ALLOCATION'
    | 'EMPLOYMENT_LETTER'
    | 'LEARNING'
  entityId: string
  /** Target state, e.g. 'EVALUATION'. */
  to: string
  /** Button text, e.g. "Reopen cycle". */
  actionLabel: string
  /** One line explaining what this will do to the record. */
  description: string
  revalidate?: string[]
  variant?: 'outline' | 'destructive' | 'ghost'
  size?: 'sm' | 'default'
}

/**
 * The shared confirm-with-a-reason dialog for every terminal-state reversal.
 *
 * The reason is mandatory because it goes into the audit row and onto the
 * record's history permanently — a reopened cycle or an un-cancelled leave
 * request should always carry an explanation of who decided that and why.
 */
export function ReversalDialog({
  entityType,
  entityId,
  to,
  actionLabel,
  description,
  revalidate,
  variant = 'outline',
  size = 'sm',
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const tooShort = reason.trim().length < MIN_REASON_LENGTH

  function submit() {
    startTransition(async () => {
      const res = await reverseRecordState({ entityType, entityId, to, reason, revalidate })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${actionLabel} — done. The reason has been recorded in the audit log.`)
      setOpen(false)
      setReason('')
      router.refresh()
    })
  }

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        {actionLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{actionLabel}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reversal-reason">Reason (required)</Label>
            <textarea
              id="reversal-reason"
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              disabled={isPending}
              placeholder="Why is this being reopened?"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Recorded permanently in the audit log against this record.
              {tooShort && reason.length > 0 && ` At least ${MIN_REASON_LENGTH} characters.`}
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={tooShort || isPending}>
              {isPending ? 'Working…' : `Confirm ${actionLabel.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
