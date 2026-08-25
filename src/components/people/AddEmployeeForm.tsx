'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createUser, type CreateUserState } from '@/actions/users'
import { DEPARTMENTS, isLogistics } from '@/lib/departments'
import { ROLES, ROLE_LABELS } from '@/lib/permissions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Manager = {
  id: string
  firstName: string
  lastName: string
  position?: string | null
}

type Props = {
  managers: Manager[]
}

const initialState: CreateUserState = {}

function FieldError({ errors, name }: { errors?: Record<string, string[]>; name: string }) {
  const msgs = errors?.[name]
  if (!msgs?.length) return null
  return <p className="mt-0.5 text-xs text-rose-600">{msgs[0]}</p>
}

/** Shared select styling, matching the inputs around it. */
const SELECT_CLASS =
  'mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30'

export function AddEmployeeForm({ managers }: Props) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(createUser, initialState)

  // Which rate fields to show is decided by the role and the department: a
  // part-timer in Logistics is paid on three day types, elsewhere on two.
  const [role, setRole] = useState('')
  const [department, setDepartment] = useState('')
  const partTime = role === 'PARTTIME'

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      )}

      {/* Basic Info */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Basic Information
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="firstName">First Name *</Label>
            <Input id="firstName" name="firstName" placeholder="First name" className="mt-1" />
            <FieldError errors={state.errors} name="firstName" />
          </div>
          <div>
            <Label htmlFor="lastName">Last Name *</Label>
            <Input id="lastName" name="lastName" placeholder="Last name" className="mt-1" />
            <FieldError errors={state.errors} name="lastName" />
          </div>
          <div>
            <Label htmlFor="email">Email *</Label>
            <Input id="email" name="email" type="email" placeholder="email@company.com" className="mt-1" />
            <FieldError errors={state.errors} name="email" />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" placeholder="+65 9123 4567" className="mt-1" />
            <FieldError errors={state.errors} name="phone" />
          </div>
          <div>
            <Label htmlFor="dateOfBirth">Date of Birth</Label>
            <Input id="dateOfBirth" name="dateOfBirth" type="date" className="mt-1" />
            <FieldError errors={state.errors} name="dateOfBirth" />
          </div>
          <div>
            <Label htmlFor="nationality">Nationality</Label>
            <Input id="nationality" name="nationality" placeholder="e.g. Singaporean" className="mt-1" />
            <FieldError errors={state.errors} name="nationality" />
          </div>
          <div>
            <Label htmlFor="citizenship">Citizenship</Label>
            <select id="citizenship" name="citizenship" className={SELECT_CLASS}>
              <option value="">Not recorded</option>
              <option value="SG_CITIZEN">SG Citizen</option>
              <option value="SG_PR">SG PR</option>
              <option value="FOREIGNER">Foreigner</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              SG PRs are asked for their entry permit and PR grant date during onboarding.
            </p>
            <FieldError errors={state.errors} name="citizenship" />
          </div>
        </div>
      </div>

      {/* Identity & Records */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Identity &amp; Records
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="employeeNumber">Employee ID</Label>
            <Input id="employeeNumber" name="employeeNumber" placeholder="e.g. IORA-0042" className="mt-1" />
            <FieldError errors={state.errors} name="employeeNumber" />
          </div>
          <div>
            <Label htmlFor="company">Company</Label>
            <Input id="company" name="company" placeholder="Legal entity" className="mt-1" />
            <FieldError errors={state.errors} name="company" />
          </div>
          <div>
            <Label htmlFor="nric">NRIC</Label>
            <Input id="nric" name="nric" placeholder="SG NRIC (locals)" className="mt-1" />
            <FieldError errors={state.errors} name="nric" />
          </div>
          <div>
            <Label htmlFor="passportNumber">Passport No.</Label>
            <Input id="passportNumber" name="passportNumber" className="mt-1" />
            <FieldError errors={state.errors} name="passportNumber" />
          </div>
          <div>
            <Label htmlFor="passportExpiry">Passport Expiry</Label>
            <Input id="passportExpiry" name="passportExpiry" type="date" className="mt-1" />
            <FieldError errors={state.errors} name="passportExpiry" />
          </div>
        </div>
      </div>

      {/* Job Info */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Job Information
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="position">Position *</Label>
            <Input id="position" name="position" placeholder="e.g. Software Engineer" className="mt-1" />
            <FieldError errors={state.errors} name="position" />
          </div>
          <div>
            <Label htmlFor="department">Department *</Label>
            <select
              id="department"
              name="department"
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
            <FieldError errors={state.errors} name="department" />
          </div>
          <div>
            <Label htmlFor="employmentType">Employment Type *</Label>
            <select id="employmentType" name="employmentType" className={SELECT_CLASS}>
              <option value="">Select type</option>
              <option value="EMPLOYEE">Employee</option>
              <option value="CONTRACTOR">Contractor</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Part-time is set by choosing the Part-time role below.
            </p>
            <FieldError errors={state.errors} name="employmentType" />
          </div>
          <div>
            <Label htmlFor="country">Country *</Label>
            <select
              id="country"
              name="country"
              className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
            >
              <option value="">Select country</option>
              <option value="SG">Singapore</option>
              <option value="MY">Malaysia</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              This determines the employee&apos;s public holiday calendar
            </p>
            <FieldError errors={state.errors} name="country" />
          </div>
          <div>
            <Label htmlFor="startDate">Start Date</Label>
            <Input id="startDate" name="startDate" type="date" className="mt-1" />
            <FieldError errors={state.errors} name="startDate" />
          </div>
          <div>
            <Label htmlFor="probationMonths">Probation (months)</Label>
            <Input id="probationMonths" name="probationMonths" type="number" min={0} max={24} defaultValue={3} className="mt-1" />
            <p className="mt-1 text-xs text-muted-foreground">Probation end is auto-computed from start date.</p>
            <FieldError errors={state.errors} name="probationMonths" />
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
              <option value="">Select account type</option>
              {ROLES.map(r => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              HR has full access. Managers see their own department and approve for their reports.
            </p>
            <FieldError errors={state.errors} name="role" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="reportingManagerId">Reporting Manager</Label>
            <select
              id="reportingManagerId"
              name="reportingManagerId"
              className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
            >
              <option value="">None</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName} {m.position ? `(${m.position})` : ''}
                </option>
              ))}
            </select>
            <FieldError errors={state.errors} name="reportingManagerId" />
          </div>
        </div>
      </div>

      {/* Pay rates — only meaningful for part-timers, whose letters quote them */}
      {partTime && (
        <div>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Hourly Rates
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {isLogistics(department)
              ? 'Logistics part-timers are paid on three day types. These are the figures the employment letter will quote.'
              : 'Retail part-timers are paid on two day types. These are the figures the employment letter will quote.'}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="hourlyRateWeekday">Weekday rate</Label>
              <Input id="hourlyRateWeekday" name="hourlyRateWeekday" type="number" step="0.01" min={0} className="mt-1" />
              <FieldError errors={state.errors} name="hourlyRateWeekday" />
            </div>
            {isLogistics(department) ? (
              <>
                <div>
                  <Label htmlFor="hourlyRateSaturday">Saturday rate</Label>
                  <Input id="hourlyRateSaturday" name="hourlyRateSaturday" type="number" step="0.01" min={0} className="mt-1" />
                  <FieldError errors={state.errors} name="hourlyRateSaturday" />
                </div>
                <div>
                  <Label htmlFor="hourlyRateSundayPh">Sunday / public holiday rate</Label>
                  <Input id="hourlyRateSundayPh" name="hourlyRateSundayPh" type="number" step="0.01" min={0} className="mt-1" />
                  <FieldError errors={state.errors} name="hourlyRateSundayPh" />
                </div>
              </>
            ) : (
              <div>
                <Label htmlFor="hourlyRateWeekend">Weekend rate</Label>
                <Input id="hourlyRateWeekend" name="hourlyRateWeekend" type="number" step="0.01" min={0} className="mt-1" />
                <FieldError errors={state.errors} name="hourlyRateWeekend" />
              </div>
            )}
            <div>
              <Label htmlFor="hourlyRate">Timesheet rate</Label>
              <Input id="hourlyRate" name="hourlyRate" type="number" step="0.01" min={0} className="mt-1" />
              <p className="mt-1 text-xs text-muted-foreground">
                What timesheet pay and the payroll export price every hour at.
              </p>
              <FieldError errors={state.errors} name="hourlyRate" />
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/people')}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Adding...' : 'Add Employee'}
        </Button>
      </div>
    </form>
  )
}
