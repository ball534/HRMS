'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SignaturePad } from '@/components/letters/SignaturePad'
import { approveLetterForSignature, rejectLetter, signLetter } from '@/actions/letters'

type Officer = { id: string; firstName: string; lastName: string; position?: string | null }

type Letter = {
  id: string
  type: 'EMPLOYMENT' | 'CONFIRMATION'
  status: string
  employeeName: string
  approvingOfficer: { id: string; firstName: string; lastName: string } | null
  reviewedByName: string | null
  driveFileId: string | null
  driveWebViewLink: string | null
  dueDate: string | null
  overdue: boolean
  rejectionReason: string | null
  signedAt: string | null
  sentAt: string | null
}

type Props = {
  letter: Letter
  officers: Officer[]
  currentUserId: string
  currentRole: string
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: 'Pending HR review',
  PENDING_SIGNATURE: 'Awaiting signature',
  SIGNED: 'Signed',
  SENT: 'Sent to employee',
  REJECTED: 'Rejected',
  OVERDUE: 'Overdue',
}

export function LetterWorkspace({ letter, officers, currentUserId, currentRole }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [officerId, setOfficerId] = useState(letter.approvingOfficer?.id ?? '')
  const [signing, setSigning] = useState(false)

  const isHr = currentRole === 'ADMIN' || currentRole === 'HR'
  const isOfficer = letter.approvingOfficer?.id === currentUserId
  const canSign = (isOfficer || currentRole === 'ADMIN') && letter.status === 'PENDING_SIGNATURE'

  function run(fn: () => Promise<{ success?: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn()
      if (res.success) {
        toast.success(ok)
        setSigning(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Something went wrong')
      }
    })
  }

  function handleApprove() {
    if (!officerId) {
      toast.error('Choose an approving officer.')
      return
    }
    run(() => approveLetterForSignature(letter.id, officerId), 'Approved — sent to the approving officer.')
  }

  function handleReject() {
    const reason = window.prompt('Reason for rejecting this letter?') ?? ''
    if (reason === null) return
    run(() => rejectLetter(letter.id, reason), 'Letter rejected.')
  }

  function handleSign(dataUrl: string) {
    run(() => signLetter(letter.id, dataUrl), 'Signed.')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Preview */}
      <div className="rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-medium">
          {letter.type === 'EMPLOYMENT' ? 'Employment letter' : 'Confirmation letter'} — {letter.employeeName}
        </div>
        {letter.driveFileId ? (
          <iframe
            src={`/api/files/${letter.driveFileId}`}
            className="h-[640px] w-full"
            title="Letter preview"
          />
        ) : (
          <div className="p-8 text-sm text-muted-foreground">
            No PDF was generated. This happens when Google Drive/Docs isn&apos;t configured or no
            letter template is set. The approval flow still works; the PDF will appear once the
            integration is configured.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-4">
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
          <div className="mt-1 text-lg font-semibold">
            {STATUS_LABEL[letter.status] ?? letter.status}
            {letter.overdue && letter.status !== 'SENT' && (
              <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                Overdue
              </span>
            )}
          </div>
          {letter.dueDate && (
            <p className="mt-1 text-xs text-muted-foreground">
              Due {new Date(letter.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
            </p>
          )}
          {letter.reviewedByName && (
            <p className="mt-1 text-xs text-muted-foreground">Reviewed by {letter.reviewedByName}</p>
          )}
          {letter.approvingOfficer && (
            <p className="mt-1 text-xs text-muted-foreground">
              Officer: {letter.approvingOfficer.firstName} {letter.approvingOfficer.lastName}
            </p>
          )}
        </div>

        {/* HR review step */}
        {letter.status === 'PENDING_REVIEW' && isHr && (
          <div className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-sm font-medium">Review &amp; assign approving officer</p>
            <div>
              <Label htmlFor="officer">Approving officer</Label>
              <select
                id="officer"
                value={officerId}
                onChange={e => setOfficerId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none"
              >
                <option value="">Choose…</option>
                {officers.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.firstName} {o.lastName} {o.position ? `(${o.position})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleApprove} disabled={pending}>
                Approve for signature
              </Button>
              <Button size="sm" variant="outline" onClick={handleReject} disabled={pending}>
                Reject
              </Button>
            </div>
          </div>
        )}

        {/* Signing step */}
        {letter.status === 'PENDING_SIGNATURE' && (
          <div className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            {canSign ? (
              signing ? (
                <SignaturePad onConfirm={handleSign} onCancel={() => setSigning(false)} pending={pending} />
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium">You are the approving officer.</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setSigning(true)} disabled={pending}>
                      Sign letter
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleReject} disabled={pending}>
                      Reject
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                Waiting for {letter.approvingOfficer?.firstName} {letter.approvingOfficer?.lastName} to sign.
              </p>
            )}
          </div>
        )}

        {letter.status === 'REJECTED' && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            Rejected{letter.rejectionReason ? `: ${letter.rejectionReason}` : '.'}
          </div>
        )}

        {(letter.status === 'SIGNED' || letter.status === 'SENT') && letter.driveWebViewLink && (
          <a
            href={letter.driveWebViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl bg-card p-4 text-sm text-primary ring-1 ring-foreground/10 hover:underline"
          >
            Open signed PDF in Drive →
          </a>
        )}
      </div>
    </div>
  )
}
