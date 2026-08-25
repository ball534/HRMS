'use client'

import { useActionState } from 'react'
import { submitOnboarding, type OnboardingActionState } from '@/actions/onboarding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Submitted = {
  at: string
  bankName: string | null
  bankAccountName: string | null
  prGrantDate: string | null
  documents: { label: string; blobId: string | null }[]
}

const initialState: OnboardingActionState = {}

function FieldError({ errors, name }: { errors?: Record<string, string[]>; name: string }) {
  const msgs = errors?.[name]
  if (!msgs?.length) return null
  return <p className="mt-0.5 text-xs text-rose-600">{msgs[0]}</p>
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function OnboardingForm({
  firstName,
  isPr,
  submitted,
}: {
  firstName: string
  isPr: boolean
  submitted: Submitted | null
}) {
  const [state, formAction, isPending] = useActionState(submitOnboarding, initialState)

  if (submitted || state.success) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="text-sm font-semibold text-emerald-900">
            Thank you{firstName ? `, ${firstName}` : ''} — we have everything we need
          </h2>
          <p className="mt-1 text-sm text-emerald-800">
            {submitted
              ? `Sent on ${fmt(submitted.at)}. HR will be in touch if anything else is needed.`
              : 'HR will be in touch if anything else is needed.'}
          </p>
        </div>

        {submitted && (
          <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <h3 className="text-sm font-semibold">What you sent</h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Bank</dt>
                <dd className="text-sm">{submitted.bankName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Name on the account</dt>
                <dd className="text-sm">{submitted.bankAccountName ?? '—'}</dd>
              </div>
              {submitted.prGrantDate && (
                <div>
                  <dt className="text-xs text-muted-foreground">PR granted</dt>
                  <dd className="text-sm">{fmt(submitted.prGrantDate)}</dd>
                </div>
              )}
            </dl>
            <ul className="mt-4 space-y-1 text-sm">
              {submitted.documents.map(d => (
                <li key={d.label}>
                  {d.blobId ? (
                    <a
                      href={`/api/files/${d.blobId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {d.label} →
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{d.label} — missing</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Your account number is held for payroll and is not shown here.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        These go to the HR team only. Nobody else in the company — including your manager — can see
        them.
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Identity
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="nricFront">Front of your NRIC *</Label>
            <Input
              id="nricFront"
              name="nricFront"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required
              className="mt-1 file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
            />
            <FieldError errors={state.errors} name="nricFront" />
          </div>
          <div>
            <Label htmlFor="nricBack">Back of your NRIC *</Label>
            <Input
              id="nricBack"
              name="nricBack"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required
              className="mt-1 file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
            />
            <FieldError errors={state.errors} name="nricBack" />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Where your salary goes
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="bankName">Bank *</Label>
            <Input id="bankName" name="bankName" required placeholder="e.g. DBS" className="mt-1" />
            <FieldError errors={state.errors} name="bankName" />
          </div>
          <div>
            <Label htmlFor="bankAccountName">Name on the account *</Label>
            <Input id="bankAccountName" name="bankAccountName" required className="mt-1" />
            <FieldError errors={state.errors} name="bankAccountName" />
          </div>
          <div>
            <Label htmlFor="bankAccountNumber">Account number *</Label>
            <Input
              id="bankAccountNumber"
              name="bankAccountNumber"
              required
              inputMode="numeric"
              autoComplete="off"
              className="mt-1"
            />
            <FieldError errors={state.errors} name="bankAccountNumber" />
          </div>
          <div>
            <Label htmlFor="bankProof">Screenshot or statement showing it *</Label>
            <Input
              id="bankProof"
              name="bankProof"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              required
              className="mt-1 file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Anything that shows the account number and the bank’s name.
            </p>
            <FieldError errors={state.errors} name="bankProof" />
          </div>
        </div>
      </fieldset>

      {isPr && (
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Permanent residency
          </legend>
          <p className="text-xs text-muted-foreground">
            Asked for because your record says you are a Singapore PR.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="prGrantDate">Date PR was granted *</Label>
              <Input id="prGrantDate" name="prGrantDate" type="date" required className="mt-1" />
              <FieldError errors={state.errors} name="prGrantDate" />
            </div>
            <div>
              <Label htmlFor="entryPermit">Entry permit (PDF) *</Label>
              <Input
                id="entryPermit"
                name="entryPermit"
                type="file"
                accept="application/pdf"
                required
                className="mt-1 file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
              />
              <FieldError errors={state.errors} name="entryPermit" />
            </div>
          </div>
        </fieldset>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Sending…' : 'Send my documents'}
      </Button>
    </form>
  )
}
