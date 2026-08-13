'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserMinus } from 'lucide-react'
import {
  getOffboardingPreview,
  offboardEmployee,
  type OffboardingPreview,
} from '@/actions/offboarding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Offboarding, with the consequences shown before anything happens.
 *
 * The counts come from the server so the person running it can see exactly what
 * will move and choose the right successor — rather than discovering weeks
 * later that a departed manager's approval queue was silently stranded.
 */
export function OffboardDialog({ userId, employeeName }: { userId: string; employeeName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<OffboardingPreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [successorId, setSuccessorId] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open || preview) return
    let cancelled = false
    getOffboardingPreview(userId).then(res => {
      if (cancelled) return
      if ('error' in res) {
        setLoadError(res.error)
        return
      }
      setPreview(res)
      setSuccessorId(res.suggestedSuccessorId ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [open, preview, userId])

  function submit() {
    startTransition(async () => {
      const res = await offboardEmployee({
        userId,
        effectiveDate,
        successorId: successorId || undefined,
        reason: reason || undefined,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      const s = res.summary!
      toast.success(
        `${employeeName} offboarded. ${s.reportsReassigned} report(s) and ` +
          `${s.leaveApprovalsReassigned + s.timesheetApprovalsReassigned + s.expenseApprovalsReassigned} approval(s) ` +
          `moved to ${s.successorName}.`,
      )
      setOpen(false)
      router.refresh()
    })
  }

  const totalApprovals = preview
    ? preview.pendingLeaveApprovals + preview.pendingTimesheetApprovals + preview.pendingExpenseApprovals
    : 0

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <UserMinus className="mr-1.5 h-3.5 w-3.5" />
        Offboard employee
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Offboard {employeeName}</DialogTitle>
            <DialogDescription>
              Their session ends immediately and the work below is handed over. This cannot be
              undone from the app.
            </DialogDescription>
          </DialogHeader>

          {loadError && <p className="text-sm text-destructive">{loadError}</p>}
          {!preview && !loadError && <p className="text-sm text-muted-foreground">Loading…</p>}

          {preview && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <p className="mb-2 font-medium">What will be handed over</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>{preview.directReports} direct report(s) reassigned</li>
                  <li>
                    {totalApprovals} pending approval(s) re-routed ({preview.pendingLeaveApprovals}{' '}
                    leave, {preview.pendingTimesheetApprovals} timesheet,{' '}
                    {preview.pendingExpenseApprovals} expense)
                  </li>
                  <li>{preview.ownPendingRequests} of their own pending request(s) cancelled</li>
                  <li>{preview.reviewsAsManager} performance review(s) they own reassigned</li>
                  <li>{preview.activePasses} work pass(es) flagged for cancellation</li>
                  <li>Annual leave prorated to the last working day for final settlement</li>
                </ul>
              </div>

              <div className="space-y-2">
                <Label htmlFor="successor">Hand over to</Label>
                <select
                  id="successor"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={successorId}
                  onChange={e => setSuccessorId(e.target.value)}
                  disabled={isPending}
                >
                  <option value="">Choose automatically (their manager, then HR/admin)</option>
                  {preview.candidates.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="effective-date">Last working day</Label>
                <Input
                  id="effective-date"
                  type="date"
                  value={effectiveDate}
                  onChange={e => setEffectiveDate(e.target.value)}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  Used to prorate their leave entitlement for final pay.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="offboard-reason">Reason (optional)</Label>
                <Input
                  id="offboard-reason"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Resignation"
                  disabled={isPending}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submit} disabled={!preview || isPending}>
              {isPending ? 'Offboarding…' : 'Offboard employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
