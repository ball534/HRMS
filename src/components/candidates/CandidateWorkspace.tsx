'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  archiveCandidate,
  passInterview,
  saveCandidateNotes,
  sendToInterview,
  type CandidateActionState,
} from '@/actions/candidates'
import { DEPARTMENTS, isLogistics } from '@/lib/departments'
import { ROLES, ROLE_LABELS } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Candidate = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  dateOfBirth: string | null
  nationality: string | null
  citizenship: string
  positionApplied: string | null
  department: string | null
  employmentTypeWanted: string | null
  earliestStartDate: string | null
  resumeBlobId: string | null
  resumeFileName: string | null
  status: string
  notes: string | null
  decidedByName: string | null
  sentToInterviewAt: string | null
  decidedAt: string | null
  hiredUser: { id: string; firstName: string; lastName: string } | null
  createdAt: string
}

type Props = {
  candidate: Candidate
  managers: { id: string; firstName: string; lastName: string; position?: string | null }[]
  kindOptions: { value: string; label: string }[]
  suggestedKind: string
  canHire: boolean
}

const SELECT_CLASS =
  'mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30'

const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-amber-50 border-amber-200 text-amber-700',
  FOR_INTERVIEW: 'bg-blue-50 border-blue-200 text-blue-700',
  PASSED: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  ARCHIVED: 'bg-zinc-100 border-zinc-200 text-zinc-600',
}

const STATUS_LABEL: Record<string, string> = {
  NEW: 'New application',
  FOR_INTERVIEW: 'Going to interview',
  PASSED: 'Hired',
  ARCHIVED: 'Not proceeding',
}

const CITIZENSHIP_LABEL: Record<string, string> = {
  SG_CITIZEN: 'Singapore Citizen',
  SG_PR: 'Singapore PR',
  FOREIGNER: 'Foreigner',
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value ?? '—'}</dd>
    </div>
  )
}

const hireInitialState: CandidateActionState = {}

export function CandidateWorkspace({ candidate, managers, kindOptions, suggestedKind, canHire }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notes, setNotes] = useState(candidate.notes ?? '')
  const [askedToHire, setAskedToHire] = useState(false)

  const [hireState, hireAction, hirePending] = useActionState(passInterview, hireInitialState)

  // Derived rather than closed by an effect: the form is open only while there
  // is no outcome to report.
  const hiring = askedToHire && !hireState.success

  useEffect(() => {
    if (hireState.success) {
      toast.success(`${candidate.firstName} has been hired — account created and letter drafted.`)
      router.refresh()
    } else if (hireState.error) {
      // Hiring reports partial success this way (e.g. the account and letter
      // were created but the welcome email bounced), so this is not always a
      // plain failure — hence the long toast.
      toast.error(hireState.error, { duration: 10000 })
      router.refresh()
    }
  }, [hireState, candidate.firstName, router])

  // The role decides which rate fields the hire form needs, exactly as on the
  // employee forms.
  const [role, setRole] = useState(
    candidate.employmentTypeWanted === 'PART_TIME' ? 'PARTTIME' : 'EMPLOYEE',
  )
  const [department, setDepartment] = useState(candidate.department ?? '')
  const partTime = role === 'PARTTIME'

  function run(fn: () => Promise<CandidateActionState>, ok: string) {
    startTransition(async () => {
      const res = await fn()
      if (res.success) {
        toast.success(ok)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Something went wrong')
      }
    })
  }

  function handleArchive() {
    const reason = window.prompt('Anything to record about why? (optional)')
    if (reason === null) return
    run(() => archiveCandidate(candidate.id, reason), 'Application archived.')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      {/* ---- The application ---- */}
      <div className="space-y-4">
        <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <h2 className="text-sm font-semibold">Application</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Fact label="Email" value={candidate.email} />
            <Fact label="Phone" value={candidate.phone} />
            <Fact label="Date of birth" value={fmt(candidate.dateOfBirth)} />
            <Fact label="Nationality" value={candidate.nationality} />
            <Fact
              label="Citizenship"
              value={CITIZENSHIP_LABEL[candidate.citizenship] ?? candidate.citizenship}
            />
            <Fact label="Applied for" value={candidate.positionApplied} />
            <Fact label="Department" value={candidate.department} />
            <Fact label="Earliest start" value={fmt(candidate.earliestStartDate)} />
            <Fact label="Received" value={fmt(candidate.createdAt)} />
          </dl>

          {candidate.resumeBlobId && (
            <a
              href={`/api/files/${candidate.resumeBlobId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm text-primary hover:underline"
            >
              Open CV{candidate.resumeFileName ? ` (${candidate.resumeFileName})` : ''} →
            </a>
          )}
        </section>

        <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <Label htmlFor="notes" className="text-sm font-semibold">
            Interview notes
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Kept on the application. If you archive it, these are what explain the decision later.
          </p>
          <textarea
            id="notes"
            rows={6}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="mt-2 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          />
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={pending || notes === (candidate.notes ?? '')}
            onClick={() => run(() => saveCandidateNotes(candidate.id, notes), 'Notes saved.')}
          >
            Save notes
          </Button>
        </section>

        {/* ---- Hiring form ---- */}
        {hiring && (
          <form action={hireAction} className="space-y-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <input type="hidden" name="candidateId" value={candidate.id} />
            <div>
              <h2 className="text-sm font-semibold">Record a passed interview</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                This creates {candidate.firstName}’s account, emails them a temporary password, and
                drafts their employment letter for review.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="position">Position *</Label>
                <Input
                  id="position"
                  name="position"
                  required
                  defaultValue={candidate.positionApplied ?? ''}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="department">Department *</Label>
                <select
                  id="department"
                  name="department"
                  required
                  className={SELECT_CLASS}
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                >
                  <option value="">Select department</option>
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="role">Account type *</Label>
                <select
                  id="role"
                  name="role"
                  className={SELECT_CLASS}
                  value={role}
                  onChange={e => setRole(e.target.value)}
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="employmentType">Employment type *</Label>
                <select
                  id="employmentType"
                  name="employmentType"
                  className={SELECT_CLASS}
                  defaultValue="EMPLOYEE"
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="CONTRACTOR">Contractor</option>
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Part-time comes from the account type.
                </p>
              </div>
              <div>
                <Label htmlFor="country">Country *</Label>
                <select id="country" name="country" className={SELECT_CLASS} defaultValue="SG">
                  <option value="SG">Singapore</option>
                  <option value="MY">Malaysia</option>
                </select>
              </div>
              <div>
                <Label htmlFor="employeeNumber">Employee ID</Label>
                <Input id="employeeNumber" name="employeeNumber" placeholder="e.g. IORA-0042" className="mt-1" />
                {hireState.errors?.employeeNumber && (
                  <p className="mt-0.5 text-xs text-rose-600">{hireState.errors.employeeNumber[0]}</p>
                )}
              </div>
              <div>
                <Label htmlFor="startDate">Start date *</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  required
                  defaultValue={candidate.earliestStartDate?.slice(0, 10) ?? ''}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="probationMonths">Probation (months)</Label>
                <Input
                  id="probationMonths"
                  name="probationMonths"
                  type="number"
                  min={0}
                  max={24}
                  defaultValue={3}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="reportingManagerId">Reporting manager</Label>
                <select id="reportingManagerId" name="reportingManagerId" className={SELECT_CLASS} defaultValue="">
                  <option value="">None</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName} {m.position ? `(${m.position})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="letterKind">Letter type</Label>
                <select id="letterKind" name="letterKind" className={SELECT_CLASS} defaultValue={suggestedKind}>
                  {kindOptions.map(k => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Suggested from the application. Interns need picking by hand.
                </p>
              </div>
            </div>

            {partTime && (
              <div className="rounded-lg border border-border p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Hourly rates
                </p>
                <p className="mb-3 text-xs text-muted-foreground">
                  {isLogistics(department)
                    ? 'Logistics: weekday, Saturday and Sunday/PH — all three are quoted in the letter.'
                    : 'Retail: weekday and weekend — both are quoted in the letter.'}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="hourlyRateWeekday">Weekday</Label>
                    <Input id="hourlyRateWeekday" name="hourlyRateWeekday" type="number" step="0.01" min={0} className="mt-1" />
                  </div>
                  {isLogistics(department) ? (
                    <>
                      <div>
                        <Label htmlFor="hourlyRateSaturday">Saturday</Label>
                        <Input id="hourlyRateSaturday" name="hourlyRateSaturday" type="number" step="0.01" min={0} className="mt-1" />
                      </div>
                      <div>
                        <Label htmlFor="hourlyRateSundayPh">Sunday / PH</Label>
                        <Input id="hourlyRateSundayPh" name="hourlyRateSundayPh" type="number" step="0.01" min={0} className="mt-1" />
                      </div>
                    </>
                  ) : (
                    <div>
                      <Label htmlFor="hourlyRateWeekend">Weekend</Label>
                      <Input id="hourlyRateWeekend" name="hourlyRateWeekend" type="number" step="0.01" min={0} className="mt-1" />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="hourlyRate">Timesheet rate</Label>
                    <Input id="hourlyRate" name="hourlyRate" type="number" step="0.01" min={0} className="mt-1" />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={hirePending}>
                {hirePending ? 'Creating…' : 'Create account & draft letter'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setAskedToHire(false)} disabled={hirePending}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* ---- Status + decisions ---- */}
      <div className="space-y-4">
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
          <div className="mt-2">
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs font-medium',
                STATUS_STYLE[candidate.status] ?? '',
              )}
            >
              {STATUS_LABEL[candidate.status] ?? candidate.status}
            </span>
          </div>
          <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
            {candidate.sentToInterviewAt && <div>Sent to interview {fmt(candidate.sentToInterviewAt)}</div>}
            {candidate.decidedAt && <div>Decided {fmt(candidate.decidedAt)}</div>}
            {candidate.decidedByName && <div>By {candidate.decidedByName}</div>}
          </dl>
        </div>

        {candidate.status === 'NEW' && (
          <div className="space-y-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-sm font-medium">Worth meeting?</p>
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => sendToInterview(candidate.id), 'Marked for interview.')}
              >
                Send to interview
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={handleArchive}>
                Archive
              </Button>
            </div>
          </div>
        )}

        {candidate.status === 'FOR_INTERVIEW' && (
          <div className="space-y-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-sm font-medium">Interview outcome</p>
            <p className="text-xs text-muted-foreground">
              Passing creates their account and drafts the letter. Failing archives the application.
            </p>
            <div className="flex flex-col gap-2">
              {canHire ? (
                <Button size="sm" disabled={pending || hiring} onClick={() => setAskedToHire(true)}>
                  Passed — hire
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  You cannot create employee records, so someone in HR needs to complete the hire.
                </p>
              )}
              <Button size="sm" variant="outline" disabled={pending} onClick={handleArchive}>
                Did not pass — archive
              </Button>
            </div>
          </div>
        )}

        {candidate.status === 'PASSED' && candidate.hiredUser && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-medium">
              Hired as {candidate.hiredUser.firstName} {candidate.hiredUser.lastName}.
            </p>
            <div className="mt-2 flex flex-col gap-1 text-xs">
              <Link href={`/people/${candidate.hiredUser.id}`} className="font-medium underline">
                Open their employee record →
              </Link>
              <Link href="/letters" className="font-medium underline">
                Go to the letter queue →
              </Link>
            </div>
          </div>
        )}

        {candidate.status === 'ARCHIVED' && (
          <div className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
            This application is archived. The notes on the left record why.
          </div>
        )}
      </div>
    </div>
  )
}
