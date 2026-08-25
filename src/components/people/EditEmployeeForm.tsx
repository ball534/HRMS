'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateUser, type UpdateUserState } from '@/actions/users'
import { DEPARTMENTS, isLogistics } from '@/lib/departments'
import { ROLES, ROLE_LABELS } from '@/lib/permissions'

type User = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  dateOfBirth?: string | null
  nationality?: string | null
  employeeNumber?: string | null
  nric?: string | null
  passportNumber?: string | null
  passportExpiry?: string | null
  company?: string | null
  position?: string | null
  department?: string | null
  employmentType: string
  country: string
  startDate?: string | null
  probationMonths?: number | null
  reportingManagerId?: string | null
  role: string
  status: string
  citizenship?: string | null
  hourlyRate?: string | null
  hourlyRateWeekday?: string | null
  hourlyRateSaturday?: string | null
  hourlyRateSundayPh?: string | null
  hourlyRateWeekend?: string | null
}

type Manager = {
  id: string
  firstName: string
  lastName: string
}

type Props = {
  user: User
  managers: Manager[]
  onClose: () => void
}

const initialState: UpdateUserState = {}

export function EditEmployeeForm({ user, managers, onClose }: Props) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(updateUser, initialState)

  // The rate fields follow the account type and department, the same way the
  // add-employee form does — a part-timer in Logistics has a Saturday and a
  // Sunday/PH rate, everyone else a single weekend rate.
  const [role, setRole] = useState(user.role)
  const [department, setDepartment] = useState(user.department ?? '')
  const partTime = role === 'PARTTIME'

  useEffect(() => {
    if (state.success) {
      toast.success('Employee updated successfully')
      onClose()
      router.refresh()
    }
  }, [state.success, onClose, router])

  // Format date for input[type=date]
  const formatDateForInput = (iso: string | null | undefined) => {
    if (!iso) return ''
    return iso.slice(0, 10)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-card p-6 ring-1 ring-foreground/10 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit Employee</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {state.error && (
          <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={user.id} />

          {/* Status — prominent at top */}
          <div className="rounded-lg border border-border bg-muted/10 p-4">
            <Label htmlFor="status" className="text-sm font-medium">Employment Status</Label>
            <select
              id="status"
              name="status"
              defaultValue={user.status}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="TERMINATED">Terminated</option>
              <option value="REJECTED">Rejected (offer declined)</option>
            </select>
            {state.errors?.status && (
              <p className="mt-1 text-xs text-rose-600">{state.errors.status[0]}</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Setting this to <strong>Terminated</strong> or <strong>Rejected</strong> archives the
              employee&apos;s document folder.
            </p>
          </div>

          {/* Name */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName">First Name *</Label>
              <Input id="firstName" name="firstName" defaultValue={user.firstName} required className="mt-1" />
              {state.errors?.firstName && (
                <p className="mt-1 text-xs text-rose-600">{state.errors.firstName[0]}</p>
              )}
            </div>
            <div>
              <Label htmlFor="lastName">Last Name *</Label>
              <Input id="lastName" name="lastName" defaultValue={user.lastName} required className="mt-1" />
              {state.errors?.lastName && (
                <p className="mt-1 text-xs text-rose-600">{state.errors.lastName[0]}</p>
              )}
            </div>
          </div>

          {/* Email */}
          <div>
            <Label htmlFor="email">Email *</Label>
            <Input id="email" name="email" type="email" defaultValue={user.email} required className="mt-1" />
            {state.errors?.email && (
              <p className="mt-1 text-xs text-rose-600">{state.errors.email[0]}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={user.phone ?? ''} className="mt-1" />
          </div>

          {/* Role & Employment Type */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="role">Account type *</Label>
              <select
                id="role"
                name="role"
                value={role}
                onChange={e => setRole(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
              >
                {ROLES.map(r => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="employmentType">Employment Type *</Label>
              <select
                id="employmentType"
                name="employmentType"
                defaultValue={user.employmentType === 'PART_TIME' ? 'EMPLOYEE' : user.employmentType}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="CONTRACTOR">Contractor</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Part-time comes from the account type, not from here.
              </p>
            </div>
          </div>

          {/* Position & Department */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="position">Position</Label>
              <Input id="position" name="position" defaultValue={user.position ?? ''} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="department">Department</Label>
              <select
                id="department"
                name="department"
                value={department}
                onChange={e => setDepartment(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
              >
                <option value="">— none —</option>
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                {/* A value set before the list existed stays selectable rather than being silently changed. */}
                {department && !DEPARTMENTS.includes(department as (typeof DEPARTMENTS)[number]) && (
                  <option value={department}>{department} (unrecognised)</option>
                )}
              </select>
            </div>
          </div>

          {/* Country */}
          <div>
            <Label htmlFor="country">Country *</Label>
            <select
              id="country"
              name="country"
              defaultValue={user.country}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
            >
              <option value="SG">Singapore</option>
              <option value="MY">Malaysia</option>
            </select>
          </div>

          {/* Dates + probation */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={formatDateForInput(user.dateOfBirth)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" name="startDate" type="date" defaultValue={formatDateForInput(user.startDate)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="probationMonths">Probation (months)</Label>
              <Input id="probationMonths" name="probationMonths" type="number" min={0} max={24} defaultValue={user.probationMonths ?? 3} className="mt-1" />
              <p className="mt-1 text-xs text-muted-foreground">Probation end date is computed from start date.</p>
            </div>
          </div>

          {/* Nationality + citizenship */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="nationality">Nationality</Label>
              <Input id="nationality" name="nationality" defaultValue={user.nationality ?? ''} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="citizenship">Citizenship</Label>
              <select
                id="citizenship"
                name="citizenship"
                defaultValue={user.citizenship ?? ''}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
              >
                <option value="">Not recorded</option>
                <option value="SG_CITIZEN">SG Citizen</option>
                <option value="SG_PR">SG PR</option>
                <option value="FOREIGNER">Foreigner</option>
              </select>
            </div>
          </div>

          {/* Hourly rates — the figures a part-time letter quotes */}
          {partTime && (
            <div className="rounded-lg border border-border p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Hourly rates
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                {isLogistics(department)
                  ? 'Logistics: weekday, Saturday and Sunday/PH.'
                  : 'Retail: weekday and weekend.'}{' '}
                Timesheet pay and the payroll export price every hour at the timesheet rate.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="hourlyRateWeekday">Weekday</Label>
                  <Input id="hourlyRateWeekday" name="hourlyRateWeekday" type="number" step="0.01" min={0} defaultValue={user.hourlyRateWeekday ?? ''} className="mt-1" />
                </div>
                {isLogistics(department) ? (
                  <>
                    <div>
                      <Label htmlFor="hourlyRateSaturday">Saturday</Label>
                      <Input id="hourlyRateSaturday" name="hourlyRateSaturday" type="number" step="0.01" min={0} defaultValue={user.hourlyRateSaturday ?? ''} className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="hourlyRateSundayPh">Sunday / PH</Label>
                      <Input id="hourlyRateSundayPh" name="hourlyRateSundayPh" type="number" step="0.01" min={0} defaultValue={user.hourlyRateSundayPh ?? ''} className="mt-1" />
                    </div>
                  </>
                ) : (
                  <div>
                    <Label htmlFor="hourlyRateWeekend">Weekend</Label>
                    <Input id="hourlyRateWeekend" name="hourlyRateWeekend" type="number" step="0.01" min={0} defaultValue={user.hourlyRateWeekend ?? ''} className="mt-1" />
                  </div>
                )}
                <div>
                  <Label htmlFor="hourlyRate">Timesheet rate</Label>
                  <Input id="hourlyRate" name="hourlyRate" type="number" step="0.01" min={0} defaultValue={user.hourlyRate ?? ''} className="mt-1" />
                </div>
              </div>
            </div>
          )}

          {/* Identity / records */}
          <div className="rounded-lg border border-border p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity &amp; records</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="employeeNumber">Employee ID</Label>
                <Input id="employeeNumber" name="employeeNumber" defaultValue={user.employeeNumber ?? ''} className="mt-1" />
                {state.errors?.employeeNumber && (
                  <p className="mt-1 text-xs text-rose-600">{state.errors.employeeNumber[0]}</p>
                )}
              </div>
              <div>
                <Label htmlFor="company">Company</Label>
                <Input id="company" name="company" defaultValue={user.company ?? ''} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="nric">NRIC</Label>
                <Input id="nric" name="nric" defaultValue={user.nric ?? ''} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="passportNumber">Passport No.</Label>
                <Input id="passportNumber" name="passportNumber" defaultValue={user.passportNumber ?? ''} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="passportExpiry">Passport Expiry</Label>
                <Input id="passportExpiry" name="passportExpiry" type="date" defaultValue={formatDateForInput(user.passportExpiry)} className="mt-1" />
              </div>
            </div>
          </div>

          {/* Reporting Manager */}
          <div>
            <Label htmlFor="reportingManagerId">Reporting Manager</Label>
            <select
              id="reportingManagerId"
              name="reportingManagerId"
              defaultValue={user.reportingManagerId ?? ''}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
            >
              <option value="">None</option>
              {managers
                .filter(m => m.id !== user.id)
                .map(m => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </option>
                ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
