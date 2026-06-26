'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CountryHolidays } from '@/components/people/CountryHolidays'
import { EditEmployeeForm } from '@/components/people/EditEmployeeForm'
import { adminResetPassword } from '@/actions/users'

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
  position?: string | null
  department?: string | null
  employmentType: string
  country: string
  startDate?: string | null
  reportingManagerId?: string | null
  role: string
  status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
  terminatedAt?: string | null
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
  managers: ManagerOption[]
  leaveBalances?: LeaveBalance[]
  leaveRequests?: LeaveRequest[]
  leaveAuditLogs?: AuditLogEntry[]
  currentYear?: number
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

export function EmployeeProfile({ user, isAdmin, managers, leaveBalances = [], leaveRequests = [], leaveAuditLogs = [], currentYear }: Props) {
  const [editing, setEditing] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()
  const avatarColor = getAvatarColor(`${user.firstName}${user.lastName}`)

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        {user.profilePhotoUrl ? (
          <img
            src={user.profilePhotoUrl}
            alt={`${user.firstName} ${user.lastName}`}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white ${avatarColor}`}
          >
            {initials}
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {user.firstName} {user.lastName}
          </h1>
          <p className="text-muted-foreground">
            {user.position ?? 'No position'} {user.department ? `· ${user.department}` : ''}
          </p>
          <div className="mt-1 flex items-center gap-2">
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
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Personal Info */}
        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-sm font-medium">Personal Info</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <dl className="space-y-3">
              <InfoRow label="Full Name" value={`${user.firstName} ${user.lastName}`} />
              <InfoRow label="Date of Birth" value={user.dateOfBirth ? format(new Date(user.dateOfBirth), 'MMM d, yyyy') : null} />
              <InfoRow label="Nationality" value={user.nationality} />
            </dl>
          </CardContent>
        </Card>

        {/* Job Info */}
        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-sm font-medium">Job Info</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <dl className="space-y-3">
              <InfoRow label="Position" value={user.position} />
              <InfoRow label="Department" value={user.department} />
              <InfoRow label="Employment Type" value={user.employmentType.charAt(0) + user.employmentType.slice(1).toLowerCase()} />
              <InfoRow label="Country" value={COUNTRY_NAMES[user.country] ?? user.country} />
              <InfoRow label="Start Date" value={user.startDate ? format(new Date(user.startDate), 'MMM d, yyyy') : null} />
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

        {/* Contact Info */}
        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-sm font-medium">Contact Info</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <dl className="space-y-3">
              <InfoRow label="Email" value={<a href={`mailto:${user.email}`} className="text-primary hover:underline">{user.email}</a>} />
              <InfoRow label="Phone" value={user.phone} />
            </dl>
          </CardContent>
        </Card>

        {/* Upcoming Holidays */}
        <CountryHolidays country={user.country} />

        {/* Direct Reports */}
        {user.directReports && user.directReports.length > 0 && (
          <Card>
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className="text-sm font-medium">
                Direct Reports ({user.directReports.length})
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

      {/* Leave Balances (Admin only) */}
      {isAdmin && (
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
      )}

      {/* Leave History (Admin only) */}
      {isAdmin && leaveRequests.length > 0 && (
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

      {/* Leave Audit Log (Admin only) */}
      {isAdmin && (
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
      )}

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
