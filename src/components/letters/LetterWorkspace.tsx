'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SignaturePad } from '@/components/letters/SignaturePad'
import {
  approveLetterForSignature,
  changeLetterKind,
  rejectLetter,
  signLetter,
  updateLetterSections,
} from '@/actions/letters'
import type { LetterSection } from '@/lib/letterSections'

type Officer = { id: string; firstName: string; lastName: string; position?: string | null }

type Letter = {
  id: string
  type: 'EMPLOYMENT' | 'CONFIRMATION'
  kind: string | null
  status: string
  employeeName: string
  employeeId: string
  sections: LetterSection[]
  approvingOfficer: { id: string; firstName: string; lastName: string } | null
  reviewedByName: string | null
  blobId: string | null
  dueDate: string | null
  overdue: boolean
  rejectionReason: string | null
  declineReason: string | null
  signedAt: string | null
  sentAt: string | null
  acceptedAt: string | null
  declinedAt: string | null
}

type Props = {
  letter: Letter
  officers: Officer[]
  kindOptions: { value: string; label: string }[]
  currentUserId: string
  /** True for HR: they can edit the wording while it is still a draft. */
  canEdit: boolean
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: 'Draft — pending HR review',
  PENDING_SIGNATURE: 'Awaiting signatory',
  SIGNED: 'Signed by the signatory',
  SENT: 'With the employee',
  ACCEPTED: 'Signed by the employee',
  DECLINED: 'Declined by the employee',
  REJECTED: 'Rejected',
  OVERDUE: 'Overdue',
}

/** A blank section, appended when HR adds one. */
function blankSection(index: number): LetterSection {
  return { id: `section-${Date.now()}-${index}`, title: '', body: '' }
}

export function LetterWorkspace({ letter, officers, kindOptions, currentUserId, canEdit }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [officerId, setOfficerId] = useState(letter.approvingOfficer?.id ?? '')
  const [signing, setSigning] = useState(false)

  const isDraft = letter.status === 'PENDING_REVIEW'
  const isSignatory = letter.approvingOfficer?.id === currentUserId
  const canSign = isSignatory && letter.status === 'PENDING_SIGNATURE'
  const editable = canEdit && isDraft

  // Local copy of the sections so HR can reorder and retype freely and save once.
  const [sections, setSections] = useState<LetterSection[]>(letter.sections)
  const dirty = JSON.stringify(sections) !== JSON.stringify(letter.sections)

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

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    ;[next[index], next[target]] = [next[target], next[index]]
    setSections(next)
  }

  function handleSave() {
    run(
      () => updateLetterSections(letter.id, sections.map(s => ({ id: s.id, title: s.title, body: s.body }))),
      'Letter saved.',
    )
  }

  function handleApprove() {
    if (!officerId) {
      toast.error('Choose who will sign this letter.')
      return
    }
    if (dirty) {
      toast.error('Save your edits before sending it for signature.')
      return
    }
    run(
      () => approveLetterForSignature(letter.id, officerId),
      'Approved — the signatory has been notified.',
    )
  }

  function handleReject() {
    const reason = window.prompt('Why is this letter being rejected?')
    if (reason === null) return
    run(() => rejectLetter(letter.id, reason), 'Letter rejected.')
  }

  function handleChangeKind(kind: string) {
    if (kind === letter.kind) return
    const ok = window.confirm(
      'Switching the letter type re-drafts the wording from that type’s standard terms. Any edits you have made will be lost. Continue?',
    )
    if (!ok) return
    run(() => changeLetterKind(letter.id, kind), 'Re-drafted from the standard terms.')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      {/* ---- Letter body: editable while it is a draft, otherwise the PDF ---- */}
      <div className="space-y-4">
        {editable ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <p className="text-sm font-medium">Letter wording</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Edit any section, reorder them, or add your own. The employee’s details have already
                been merged in — what you read here is what the PDF will say.
              </p>
            </div>

            {sections.map((section, index) => (
              <div key={section.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <Label htmlFor={`title-${section.id}`} className="text-xs">
                      Section heading
                    </Label>
                    <Input
                      id={`title-${section.id}`}
                      value={section.title}
                      className="mt-1"
                      onChange={e =>
                        setSections(prev =>
                          prev.map((s, i) => (i === index ? { ...s, title: e.target.value } : s)),
                        )
                      }
                    />
                  </div>
                  <div className="flex shrink-0 gap-1 pt-5">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="Move section up"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="Move section down"
                      disabled={index === sections.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="Delete section"
                      onClick={() => setSections(prev => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3">
                  <Label htmlFor={`body-${section.id}`} className="text-xs">
                    Text
                  </Label>
                  <textarea
                    id={`body-${section.id}`}
                    value={section.body}
                    rows={Math.min(16, Math.max(4, section.body.split('\n').length + 2))}
                    className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-relaxed focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
                    onChange={e =>
                      setSections(prev =>
                        prev.map((s, i) => (i === index ? { ...s, body: e.target.value } : s)),
                      )
                    }
                  />
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSections(prev => [...prev, blankSection(prev.length)])}
              >
                <Plus className="mr-1 h-4 w-4" /> Add section
              </Button>
              <Button type="button" onClick={handleSave} disabled={!dirty || pending}>
                {pending ? 'Saving…' : 'Save letter'}
              </Button>
              {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-medium">
              {letter.type === 'EMPLOYMENT' ? 'Employment letter' : 'Confirmation letter'} —{' '}
              {letter.employeeName}
            </div>
            {letter.blobId ? (
              <iframe
                src={`/api/files/${letter.blobId}`}
                className="h-[680px] w-full"
                title="Letter preview"
              />
            ) : (
              <div className="space-y-4 p-6">
                <p className="text-sm text-muted-foreground">
                  The PDF could not be drawn for this letter. The wording below is what it holds.
                </p>
                {letter.sections.map(s => (
                  <div key={s.id}>
                    <h3 className="text-sm font-semibold">{s.title}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{s.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Status and actions ---- */}
      <div className="space-y-4">
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
          <div className="mt-1 text-lg font-semibold">
            {STATUS_LABEL[letter.status] ?? letter.status}
            {letter.overdue && letter.status === 'PENDING_SIGNATURE' && (
              <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                Overdue
              </span>
            )}
          </div>
          <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
            {letter.dueDate && (
              <div>
                Due{' '}
                {new Date(letter.dueDate).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </div>
            )}
            {letter.reviewedByName && <div>Reviewed by {letter.reviewedByName}</div>}
            {letter.approvingOfficer && (
              <div>
                Signatory: {letter.approvingOfficer.firstName} {letter.approvingOfficer.lastName}
              </div>
            )}
            {letter.sentAt && <div>Sent to the employee</div>}
            {letter.acceptedAt && <div>Signed by the employee</div>}
          </dl>
        </div>

        {/* Letter type — only meaningful for employment letters, only while a draft */}
        {editable && letter.type === 'EMPLOYMENT' && (
          <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <Label htmlFor="kind" className="text-sm font-medium">
              Letter type
            </Label>
            <p className="mt-1 mb-2 text-xs text-muted-foreground">
              Chosen from the employee’s department and employment type. Change it to re-draft from
              a different set of standard terms.
            </p>
            <select
              id="kind"
              value={letter.kind ?? ''}
              disabled={pending}
              onChange={e => handleChangeKind(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring focus-visible:outline-none"
            >
              {kindOptions.map(k => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* HR review step */}
        {isDraft && canEdit && (
          <div className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-sm font-medium">Send for signature</p>
            <div>
              <Label htmlFor="officer">Signatory</Label>
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
              <p className="mt-1 text-xs text-muted-foreground">
                Pre-selected from the department’s default signatory in Settings.
              </p>
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
                <SignaturePad
                  onConfirm={dataUrl => run(() => signLetter(letter.id, dataUrl), 'Signed.')}
                  onCancel={() => setSigning(false)}
                  pending={pending}
                />
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium">You are the signatory on this letter.</p>
                  <p className="text-xs text-muted-foreground">
                    Signing sends it to {letter.employeeName} for their signature.
                  </p>
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
                Waiting for {letter.approvingOfficer?.firstName} {letter.approvingOfficer?.lastName}{' '}
                to sign.
              </p>
            )}
          </div>
        )}

        {letter.status === 'REJECTED' && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            Rejected{letter.rejectionReason ? `: ${letter.rejectionReason}` : '.'}
          </div>
        )}

        {letter.status === 'DECLINED' && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            The employee declined this letter
            {letter.declineReason ? `: ${letter.declineReason}` : '.'}
          </div>
        )}

        {letter.blobId && !editable && (
          <a
            href={`/api/files/${letter.blobId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl bg-card p-4 text-sm text-primary ring-1 ring-foreground/10 hover:underline"
          >
            Open the PDF in a new tab →
          </a>
        )}
      </div>
    </div>
  )
}
