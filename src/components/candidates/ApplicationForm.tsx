'use client'

import { useActionState } from 'react'
import { submitApplication, type CandidateActionState } from '@/actions/candidates'
import { DEPARTMENTS } from '@/lib/departments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialState: CandidateActionState = {}

const SELECT_CLASS =
  'mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30'

function FieldError({ errors, name }: { errors?: Record<string, string[]>; name: string }) {
  const msgs = errors?.[name]
  if (!msgs?.length) return null
  return <p className="mt-0.5 text-xs text-rose-600">{msgs[0]}</p>
}

export function ApplicationForm() {
  const [state, formAction, isPending] = useActionState(submitApplication, initialState)

  if (state.success) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-lg font-semibold text-emerald-900">Application received</h2>
        <p className="mt-2 text-sm text-emerald-800">
          Thank you. Our HR team will review your application and contact you by email if they would
          like to arrange an interview.
        </p>
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

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          About you
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="firstName">First name *</Label>
            <Input id="firstName" name="firstName" required className="mt-1" />
            <FieldError errors={state.errors} name="firstName" />
          </div>
          <div>
            <Label htmlFor="lastName">Last name *</Label>
            <Input id="lastName" name="lastName" required className="mt-1" />
            <FieldError errors={state.errors} name="lastName" />
          </div>
          <div>
            <Label htmlFor="email">Email *</Label>
            <Input id="email" name="email" type="email" required className="mt-1" />
            <FieldError errors={state.errors} name="email" />
          </div>
          <div>
            <Label htmlFor="phone">Phone *</Label>
            <Input id="phone" name="phone" type="tel" required placeholder="+65 9123 4567" className="mt-1" />
            <FieldError errors={state.errors} name="phone" />
          </div>
          <div>
            <Label htmlFor="dateOfBirth">Date of birth *</Label>
            <Input id="dateOfBirth" name="dateOfBirth" type="date" required className="mt-1" />
            <FieldError errors={state.errors} name="dateOfBirth" />
          </div>
          <div>
            <Label htmlFor="nationality">Nationality *</Label>
            <Input id="nationality" name="nationality" required placeholder="e.g. Singaporean" className="mt-1" />
            <FieldError errors={state.errors} name="nationality" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="citizenship">Citizenship status *</Label>
            <select id="citizenship" name="citizenship" required defaultValue="" className={SELECT_CLASS}>
              <option value="" disabled>
                Select one
              </option>
              <option value="SG_CITIZEN">Singapore Citizen</option>
              <option value="SG_PR">Singapore Permanent Resident</option>
              <option value="FOREIGNER">Foreigner (work pass required)</option>
            </select>
            <FieldError errors={state.errors} name="citizenship" />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          The role
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="positionApplied">Role you are applying for *</Label>
            <Input
              id="positionApplied"
              name="positionApplied"
              required
              placeholder="e.g. Sales Associate"
              className="mt-1"
            />
            <FieldError errors={state.errors} name="positionApplied" />
          </div>
          <div>
            <Label htmlFor="department">Department</Label>
            <select id="department" name="department" defaultValue="" className={SELECT_CLASS}>
              <option value="">Not sure</option>
              {DEPARTMENTS.map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="employmentTypeWanted">Looking for</Label>
            <select
              id="employmentTypeWanted"
              name="employmentTypeWanted"
              defaultValue=""
              className={SELECT_CLASS}
            >
              <option value="">No preference</option>
              <option value="EMPLOYEE">Full-time</option>
              <option value="PART_TIME">Part-time</option>
              <option value="CONTRACTOR">Contract / internship</option>
            </select>
          </div>
          <div>
            <Label htmlFor="earliestStartDate">Earliest start date</Label>
            <Input id="earliestStartDate" name="earliestStartDate" type="date" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="resume">CV (PDF or Word)</Label>
            <Input
              id="resume"
              name="resume"
              type="file"
              accept=".pdf,.doc,.docx"
              className="mt-1 file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
            />
            <FieldError errors={state.errors} name="resume" />
          </div>
        </div>
      </fieldset>

      {/*
        Honeypot. Hidden from people, filled in by bots; the action treats any
        value here as a submission to discard. Kept out of the tab order and
        announced to nobody.
      */}
      <div aria-hidden className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? 'Sending…' : 'Send application'}
      </Button>
    </form>
  )
}
