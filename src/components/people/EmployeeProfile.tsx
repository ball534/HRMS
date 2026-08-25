'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, differenceInCalendarMonths } from 'date-fns'
import { toast } from 'sonner'
import {
  User as UserIcon,
  Briefcase,
  Mail,
  Phone,
  IdCard,
  CalendarClock,
  Users,
  Route,
  Clock,
  Building2,
  MapPin,
  CalendarDays,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CountryHolidays } from '@/components/people/CountryHolidays'
import { EditEmployeeForm } from '@/components/people/EditEmployeeForm'
import { CareerJourney, type CareerEventItem } from '@/components/people/CareerJourney'
import { adminResetPassword, setConfirmationDate } from '@/actions/users'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Manager = {
  id: string
  firstName: string
  lastName: string
} | null

type DirectReport = {
  id: string
  firstName: string
  lastName: string
  position?: string | null
}

type ManagerOption = {
  id: string
  firstName: string
  lastName: string
}

type User = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  dateOfBirth?: string | null
  nationality?: string | null
  profilePhotoUrl?: string | null
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
  probationEndDate?: string | null
  confirmationDate?: string | null
  reportingManagerId?: string | null
  role: string
  citizenship?: string | null
  hourlyRate?: string | null
  hourlyRateWeekday?: string | null
  hourlyRateSaturday?: string | null
  hourlyRateSundayPh?: string | null
  hourlyRateWeekend?: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED' | 'REJECTED'
  terminatedAt?: string | null
  folderArchivedAt?: string | null
  reportingManager?: Manager
  directReports?: DirectReport[]
}

const COUNTRY_NAMES: Record<string, string> = {
  SG: 'Singapore',
  MY: 'Malaysia',
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  INACTIVE: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  TERMINATED: 'bg-rose-50 text-rose-700 border-rose-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
}

const AVATAR_COLORS = [
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-blue-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-pink-500',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value ?? '—'}</dd>
    </div>
  )
}

function tenureLabel(startDate: string | null | undefined): string | null {
  if (!startDate) return null
  const months = differenceInCalendarMonths(new Date(), new Date(startDate))
  if (months < 1) return 'New joiner'
  const yrs = Math.floor(months / 12)
  const mos = months % 12
  const parts: string[] = []
  if (yrs > 0) parts.push(`${yrs} yr${yrs === 1 ? '' : 's'}`)
  if (mos > 0) parts.push(`${mos} mo`)
  return parts.join(' ')
}

type LeaveBalance = {
  id: string
  leaveTypeName: string
  entitlement: number
  used: number
  pending: number
  carryForward: number
  adjustment: number
  available: number
}

type LeaveRequest = {
  id: string
  leaveTypeName: string
  startDate: string
  endDate: string
  daysCount: number
  status: string
  reason: string | null
  approver: string | null
  createdAt: string
}

type AuditLogEntry = {
  id: string
  action: string
  actor: string
  details: Record<string, unknown> | null
  createdAt: string
}

type Props = {
  user: User
  isAdmin: boolean
  isSelf?: boolean
  managers: ManagerOption[]
  leaveBalances?: LeaveBalance[]
  leaveRequests?: LeaveRequest[]
  leaveAuditLogs?: AuditLogEntry[]
  currentYear?: number
  careerEvents?: CareerEventItem[]
  workPassSlot?: React.ReactNode
  /** Offboarding control — present only for callers holding people.offboard. */
  offboardSlot?: React.ReactNode
}

const LEAVE_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
}

function formatAuditDetails(action: string, details: Record<string, unknown>): string {
  if (action === 'BALANCE_ADJUSTED') {
    const delta = details.delta as number
    const reason = details.reason as string | undefined
    return `${delta > 0 ? '+' : ''}${delta} days${reason ? ` — ${reason}` : ''}`
  }
  if (action === 'LEAVE_SUBMITTED' || action === 'LEAVE_DELETED') {
    const days = details.daysCount as number | undefined
    return days ? `${days} day${days === 1 ? '' : 's'}` : ''
  }
  if (action === 'LEAVE_REJECTED' || action === 'LEAVE_APPROVED') {
    const comment = details.comment as string | undefined
    return comment ?? ''
  }
  if (action === 'LEAVE_CANCELLED') {
    const prev = details.previousStatus as string | undefined
    return prev ? `Was: ${prev.toLowerCase()}` : ''
  }
  return ''
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  LEAVE_SUBMITTED: 'Leave submitted',
  LEAVE_APPROVED: 'Leave approved',
  LEAVE_REJECTED: 'Leave rejected',
  LEAVE_CANCELLED: 'Leave cancelled',
  LEAVE_DELETED: 'Leave deleted',
  BALANCE_ADJUSTED: 'Balance adjusted',
}

type TabId = 'overview' | 'journey' | 'leave' | 'workpasses'

export function EmployeeProfile({
  user,
  isAdmin,
  isSelf = false,
  managers,
  leaveBalances = [],
  leaveRequests = [],
  leaveAuditLogs = [],
  currentYear,
  careerEvents = [],
  workPassSlot,
  offboardSlot,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [tab, setTab] = useState<TabId>('overview')
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()
  const avatarColor = getAvatarColor(`${user.firstName}${user.lastName}`)
  const tenure = tenureLabel(user.startDate)

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Overview', icon: UserIcon },
  ]
  if (isSelf) tabs.push({ id: 'journey', label: 'My Journey', icon: Route })
  if (isAdmin) tabs.push({ id: 'leave', label: 'Leave & Time Off', icon: Clock })
  if (isAdmin && workPassSlot) tabs.push({ id: 'workpasses', label: 'Work Passes', icon: IdCard })

  async function handleResetPassword() {
    if (!confirm(`Reset password for ${user.firstName} ${user.lastName}? They will need to change it on next login.`)) return
    setResettingPassword(true)
    try {
      const result = await adminResetPassword(user.id)
      if (result.success) {
        toast.success(`Password reset. Temporary password: ${result.tempPassword}`)
      } else {
        toast.error(result.error ?? 'Failed to reset password')
      }
    } catch {
      toast.error('Failed to reset password')
    } finally {
      setResettingPassword(false)
    }
  }

  // Probation standing shown as a plain-language pill in the hero.
  const probationBadge = (() => {
    if (user.status !== 'ACTIVE') return null
    if (user.confirmationDate) {
      const confirmed = new Date(user.confirmationDate) <= new Date()
      return {
        label: confirmed
          ? `Confirmed ${format(new Date(user.confirmationDate), 'dd MMM yyyy')}`
          : `Confirmation on ${format(new Date(user.confirmationDate), 'dd MMM yyyy')}`,
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      }
    }
    if (user.probationEndDate) {
      const end = new Date(user.probationEndDate)
      return end > new Date()
        ? {
            label: `On probation until ${format(end, 'dd MMM yyyy')}`,
            className: 'bg-amber-50 text-amber-700 border-amber-200',
          }
        : {
            label: 'Probation ended — confirmation pending',
            className: 'bg-orange-50 text-orange-700 border-orange-200',
          }
    }
    return null
  })()

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-start gap-5">
          {user.profilePhotoUrl ? (
            <img
              src={user.profilePhotoUrl}
              alt={`${user.firstName} ${user.lastName}`}
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <div
              className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white ${avatarColor}`}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">
              {user.firstName} {user.lastName}
            </h1>
            <p className="text-muted-foreground">
              {user.position ?? 'No position'} {user.department ? `· ${user.department}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[user.status]}`}
              >
                {user.status.charAt(0) + user.status.slice(1).toLowerCase()}
              </span>
              {user.status === 'TERMINATED' && user.terminatedAt && (
                <span className="text-xs text-muted-foreground">
                  on {format(new Date(user.terminatedAt), 'dd MMM yyyy')}
                </span>
              )}
              {isAdmin && probationBadge && (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${probationBadge.className}`}
                >
                  {probationBadge.label}
                </span>
              )}
            </div>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetPassword}
                disabled={resettingPassword}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/30 transition-colors disabled:opacity-50"
              >
                {resettingPassword ? 'Resetting...' : 'Reset Password'}
              </button>
              <button
                onClick={() => setEditing(true)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
              >
                Edit
              </button>
              {offboardSlot}
            </div>
          )}
        </div>

        {/* Key facts strip */}
        <div className="mt-5 grid gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <HeroFact icon={Mail} label="Email">
            <a href={`mailto:${user.email}`} className="text-primary hover:underline break-all">
              {user.email}
            </a>
          </HeroFact>
          <HeroFact icon={Phone} label="Phone">{user.phone ?? '—'}</HeroFact>
          <HeroFact icon={CalendarDays} label="Start Date">
            {user.startDate ? (
              <>
                {format(new Date(user.startDate), 'MMM d, yyyy')}
                {tenure && <span className="text-muted-foreground"> · {tenure}</span>}
              </>
            ) : (
              '—'
            )}
          </HeroFact>
          <HeroFact icon={MapPin} label="Country">
            {COUNTRY_NAMES[user.country] ?? user.country}
          </HeroFact>
          {isAdmin && (
            <HeroFact icon={IdCard} label="Employee ID">{user.employeeNumber ?? '—'}</HeroFact>
          )}
          {isAdmin && (
            <HeroFact icon={Building2} label="Company">{user.company ?? '—'}</HeroFact>
          )}
          <HeroFact icon={Briefcase} label="Employment Type">
            {user.employmentType.charAt(0) + user.employmentType.slice(1).toLowerCase().replace('_', '-')}
          </HeroFact>
          <HeroFact icon={Users} label="Reports To">
            {user.reportingManager ? (
              <Link href={`/people/${user.reportingManager.id}`} className="text-primary hover:underline">
                {user.reportingManager.firstName} {user.reportingManager.lastName}
              </Link>
            ) : (
              '—'
            )}
          </HeroFact>
        </div>
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-border">
          {tabs.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      {/* ============ Overview tab ============ */}
      {tab === 'overview' && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <UserIcon className="h-4 w-4 text-muted-foreground" /> Personal Info
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <dl className="space-y-3">
                <InfoRow label="Full Name" value={`${user.firstName} ${user.lastName}`} />
                <InfoRow label="Date of Birth" value={user.dateOfBirth ? format(new Date(user.dateOfBirth), 'MMM d, yyyy') : null} />
                <InfoRow label="Nationality" value={user.nationality} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Briefcase className="h-4 w-4 text-muted-foreground" /> Job Info
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <dl className="space-y-3">
                <InfoRow label="Position" value={user.position} />
                <InfoRow label="Department" value={user.department} />
                <InfoRow label="Role" value={user.role.charAt(0) + user.role.slice(1).toLowerCase()} />
                <InfoRow
                  label="Reporting Manager"
                  value={
                    user.reportingManager ? (
                      <Link
                        href={`/people/${user.reportingManager.id}`}
                        className="text-primary hover:underline"
                      >
                        {user.reportingManager.firstName} {user.reportingManager.lastName}
                      </Link>
                    ) : null
                  }
                />
              </dl>
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader className="border-b border-border pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <IdCard className="h-4 w-4 text-muted-foreground" /> Identity &amp; Records
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <dl className="space-y-3">
                  <InfoRow label="Employee ID" value={user.employeeNumber} />
                  <InfoRow label="Company" value={user.company} />
                  <InfoRow label="NRIC" value={user.nric} />
                  <InfoRow label="Passport No." value={user.passportNumber} />
                  <InfoRow
                    label="Passport Expiry"
                    value={user.passportExpiry ? format(new Date(user.passportExpiry), 'MMM d, yyyy') : null}
                  />
                </dl>
              </CardContent>
            </Card>
          )}

          {isAdmin && (
            <Card>
              <CardHeader className="border-b border-border pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" /> Probation &amp; Confirmation
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <dl className="space-y-3">
                  <InfoRow
                    label="Probation End (auto)"
                    value={user.probationEndDate ? format(new Date(user.probationEndDate), 'MMM d, yyyy') : null}
                  />
                  <ConfirmationDateSetter userId={user.id} current={user.confirmationDate ?? null} />
                </dl>
              </CardContent>
            </Card>
          )}

          <CountryHolidays country={user.country} />

          {user.directReports && user.directReports.length > 0 && (
            <Card>
              <CardHeader className="border-b border-border pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-muted-foreground" /> Direct Reports ({user.directReports.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  {user.directReports.map((report) => (
                    <Link
                      key={report.id}
                      href={`/people/${report.id}`}
                      className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/20 transition-colors"
                    >
                      <span className="text-sm font-medium text-primary hover:underline">
                        {report.firstName} {report.lastName}
                      </span>
                      {report.position && (
                        <span className="text-xs text-muted-foreground">— {report.position}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ============ Journey tab (own profile) ============ */}
      {tab === 'journey' && isSelf && (
        <CareerJourney
          events={careerEvents}
          user={{
            firstName: user.firstName,
            position: user.position,
            department: user.department,
            company: user.company,
            startDate: user.startDate,
            probationEndDate: user.probationEndDate,
            confirmationDate: user.confirmationDate,
            status: user.status,
          }}
        />
      )}

      {/* ============ Leave tab (admin) ============ */}
      {tab === 'leave' && isAdmin && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Leave Balances ({currentYear})</h2>
              <Link
                href="/admin/leave"
                className="text-sm text-primary hover:underline"
              >
                Manage Balances
              </Link>
            </div>
            {leaveBalances.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-xl bg-card p-6 ring-1 ring-foreground/10">No leave balances for this year.</p>
            ) : (
            <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Leave Type</th>
                    <th className="px-4 py-3 font-medium text-right">Entitlement</th>
                    <th className="px-4 py-3 font-medium text-right">Carry Forward</th>
                    <th className="px-4 py-3 font-medium text-right">Adjustment</th>
                    <th className="px-4 py-3 font-medium text-right">Used</th>
                    <th className="px-4 py-3 font-medium text-right">Pending</th>
                    <th className="px-4 py-3 font-medium text-right">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveBalances.map(b => (
                    <tr key={b.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-3 font-medium">{b.leaveTypeName}</td>
                      <td className="px-4 py-3 text-right">{b.entitlement}</td>
                      <td className="px-4 py-3 text-right">{b.carryForward || '—'}</td>
                      <td className="px-4 py-3 text-right">{b.adjustment || '—'}</td>
                      <td className="px-4 py-3 text-right">{b.used || '—'}</td>
                      <td className="px-4 py-3 text-right">{b.pending || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{b.available}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>

          {leaveRequests.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Leave History</h2>
              <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">From</th>
                      <th className="px-4 py-3 font-medium">To</th>
                      <th className="px-4 py-3 font-medium text-right">Days</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Approver</th>
                      <th className="px-4 py-3 font-medium">Requested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRequests.map(r => (
                      <tr key={r.id} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-3 font-medium">{r.leaveTypeName}</td>
                        <td className="px-4 py-3">{format(new Date(r.startDate), 'dd MMM yyyy')}</td>
                        <td className="px-4 py-3">{format(new Date(r.endDate), 'dd MMM yyyy')}</td>
                        <td className="px-4 py-3 text-right">{r.daysCount}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${LEAVE_STATUS_STYLES[r.status] ?? ''}`}>
                            {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.approver ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{format(new Date(r.createdAt), 'dd MMM yyyy')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Leave Audit Log</h2>
            {leaveAuditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-xl bg-card p-6 ring-1 ring-foreground/10">No audit log entries yet.</p>
            ) : (
            <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">By</th>
                    <th className="px-4 py-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveAuditLogs.map(log => (
                    <tr key={log.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.createdAt), 'dd MMM yyyy HH:mm')}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{log.actor}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {log.details && formatAuditDetails(log.action, log.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </div>
      )}

      {/* ============ Work Passes tab (admin) ============ */}
      {tab === 'workpasses' && isAdmin && workPassSlot}

      {/* Edit Modal */}
      {editing && (
        <EditEmployeeForm
          user={user}
          managers={managers}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

function HeroFact({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{children}</p>
      </div>
    </div>
  )
}

function ConfirmationDateSetter({ userId, current }: { userId: string; current: string | null }) {
  const router = useRouter()
  const [value, setValue] = useState(current ? current.slice(0, 10) : '')
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const res = await setConfirmationDate(userId, value || null)
      if (res.success) {
        toast.success(value ? 'Confirmation date set — confirmation letter started.' : 'Confirmation date cleared.')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Failed to save')
      }
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-xs text-muted-foreground">Confirmation Date (manual)</dt>
      <dd className="flex items-center gap-2">
        <Input
          type="date"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="h-8 max-w-[160px]"
        />
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </dd>
      <p className="text-xs text-muted-foreground">
        Setting this starts the confirmation-letter flow (HR review → boss signs → sent on the date).
      </p>
    </div>
  )
}
