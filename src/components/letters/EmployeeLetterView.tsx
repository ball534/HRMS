'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SignaturePad } from '@/components/letters/SignaturePad'
import { acceptLetter, declineLetter } from '@/actions/letters'
import type { LetterSection } from '@/lib/letterSections'

type Letter = {
  id: string
  type: 'EMPLOYMENT' | 'CONFIRMATION'
  status: string
  blobId: string | null
  sections: LetterSection[]
  signatoryName: string | null
  acceptedAt: string | null
  declinedAt: string | null
  declineReason: string | null
}

/**
 * What the employee sees: the letter itself, and — while it is waiting on them —
 * the choice to sign it or say why they cannot.
 *
 * The wording is rendered as text as well as offered as a PDF. An offer someone
 * is being asked to sign should be readable without depending on the browser's
 * PDF viewer.
 */
export function EmployeeLetterView({ letter }: { letter: Letter }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [signing, setSigning] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')

  const awaitingMe = letter.status === 'SENT'

  function run(fn: () => Promise<{ success?: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn()
      if (res.success) {
        toast.success(ok)
        setSigning(false)
        setDeclining(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Something went wrong')
      }
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* The letter */}
      <div className="space-y-4">
        <article className="space-y-5 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          {letter.sections.map(section => (
            <section key={section.id}>
              <h2 className="text-sm font-semibold">{section.title}</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {section.body}
              </p>
            </section>
          ))}
          {letter.signatoryName && (
            <p className="border-t border-border pt-4 text-xs text-muted-foreground">
              Signed for and on behalf of the Group by {letter.signatoryName}.
            </p>
          )}
        </article>

        {letter.blobId && (
          <a
            href={`/api/files/${letter.blobId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-primary hover:underline"
          >
            Open the PDF in a new tab →
          </a>
        )}
      </div>

      {/* The decision */}
      <div className="space-y-4">
        {awaitingMe && (
          <div className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-sm font-medium">Your response</p>
            <p className="text-xs text-muted-foreground">
              Read the letter through. Signing records your acceptance and files a countersigned
              copy in your documents.
            </p>

            {signing ? (
              <SignaturePad
                onConfirm={dataUrl =>
                  run(() => acceptLetter(letter.id, dataUrl), 'Signed — welcome aboard.')
                }
                onCancel={() => setSigning(false)}
                pending={pending}
              />
            ) : declining ? (
              <div className="space-y-2">
                <label htmlFor="reason" className="text-xs font-medium">
                  Let HR know why (optional)
                </label>
                <textarea
                  id="reason"
                  rows={4}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => run(() => declineLetter(letter.id, reason), 'Response recorded.')}
                  >
                    Confirm decline
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => setDeclining(false)}>
                    Back
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button size="sm" disabled={pending} onClick={() => setSigning(true)}>
                  Accept and sign
                </Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setDeclining(true)}>
                  Decline
                </Button>
              </div>
            )}
          </div>
        )}

        {letter.status === 'ACCEPTED' && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-medium">You signed this letter.</p>
            <p className="mt-1 text-xs">
              A countersigned copy is in your documents. Next: send us your onboarding documents.
            </p>
            <a href="/onboarding" className="mt-2 inline-block text-xs font-medium underline">
              Go to onboarding documents →
            </a>
          </div>
        )}

        {letter.status === 'DECLINED' && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            You declined this letter
            {letter.declineReason ? `: ${letter.declineReason}` : '.'} HR has been told.
          </div>
        )}

        {!awaitingMe && letter.status !== 'ACCEPTED' && letter.status !== 'DECLINED' && (
          <div className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
            This letter is still being prepared. You will be notified when it needs your signature.
          </div>
        )}
      </div>
    </div>
  )
}
