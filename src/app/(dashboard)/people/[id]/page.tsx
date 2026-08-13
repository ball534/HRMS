import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { db } from '@/lib/db'
import { OffboardDialog } from '@/components/people/OffboardDialog'
import { getLeaveAuditLogs } from '@/lib/audit'
import { EmployeeProfile } from '@/components/people/EmployeeProfile'
import { WorkPassManager } from '@/components/people/WorkPassManager'

type Props = {
  params: Promise<{ id: string }>
}

export default async function PersonPage({ params }: Props) {
  const { id } = await params
  const session = await verifySession()
  // Capability-driven rather than `role === 'ADMIN'`: the HR team now holds
  // people.write and people.read.identity, so the HR side of this profile
  // (identity records, leave, work passes) is visible to them without sharing
  // the admin login.
  const isAdmin = can(session.role, 'people.write')
  const canOffboard = can(session.role, 'people.offboard')
  const isSelf = session.userId === id
  const currentYear = new Date().getFullYear()

  const [user, managers, leaveBalances, leaveRequests, auditLogs] = await Promise.all([
    db.user.findUnique({
      where: { id },
      include: {
        reportingManager: {
          select: { id: true, firstName: true, lastName: true },
        },
        directReports: {
          select: { id: true, firstName: true, lastName: true, position: true },
        },
      },
    }),
    isAdmin
      ? db.user.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, firstName: true, lastName: true },
          orderBy: { firstName: 'asc' },
        })
      : [],
    // Leave balances for current year (admin only)
    isAdmin
      ? db.leaveBalance.findMany({
          where: { userId: id, year: currentYear },
          include: { leaveType: { select: { name: true } } },
          orderBy: { leaveType: { name: 'asc' } },
        })
      : [],
    // Recent leave requests (admin only)
    isAdmin
      ? db.leaveRequest.findMany({
          where: { userId: id },
          include: {
            leaveType: { select: { name: true } },
            approver: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : [],
    // Audit logs (admin only)
    isAdmin ? getLeaveAuditLogs(id) : [],
  ])

  if (!user) {
    notFound()
  }

  const {
    passwordHash: _,
    ...userForDisplay
  } = user

  const serialized = {
    ...userForDisplay,
    dateOfBirth: userForDisplay.dateOfBirth?.toISOString() ?? null,
    startDate: userForDisplay.startDate?.toISOString() ?? null,
    terminatedAt: userForDisplay.terminatedAt?.toISOString() ?? null,
    passportExpiry: userForDisplay.passportExpiry?.toISOString() ?? null,
    probationEndDate: userForDisplay.probationEndDate?.toISOString() ?? null,
    confirmationDate: userForDisplay.confirmationDate?.toISOString() ?? null,
    folderArchivedAt: userForDisplay.folderArchivedAt?.toISOString() ?? null,
    createdAt: userForDisplay.createdAt.toISOString(),
    updatedAt: userForDisplay.updatedAt.toISOString(),
  }

  const serializedBalances = leaveBalances.map(b => ({
    id: b.id,
    leaveTypeName: b.leaveType.name,
    entitlement: b.entitlement,
    used: b.used,
    pending: b.pending,
    carryForward: b.carryForward,
    adjustment: b.adjustment,
    available: b.entitlement + b.carryForward + b.adjustment - b.used - b.pending,
  }))

  const serializedRequests = leaveRequests.map(r => ({
    id: r.id,
    leaveTypeName: r.leaveType.name,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    daysCount: r.daysCount,
    status: r.status,
    reason: r.reason,
    approver: r.approver ? `${r.approver.firstName} ${r.approver.lastName}` : null,
    createdAt: r.createdAt.toISOString(),
  }))

  const serializedAuditLogs = auditLogs.map(log => ({
    id: log.id,
    action: log.action,
    actor: `${log.user.firstName} ${log.user.lastName}`,
    details: log.details as Record<string, unknown> | null,
    createdAt: log.createdAt.toISOString(),
  }))

  const workPasses = isAdmin
    ? await db.workPass.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
      })
    : []
  const serializedWorkPasses = workPasses.map(p => ({
    id: p.id,
    passType: p.passType,
    passNumber: p.passNumber,
    workPermitNumber: p.workPermitNumber,
    finNumber: p.finNumber,
    applicationDate: p.applicationDate?.toISOString() ?? null,
    approvalDate: p.approvalDate?.toISOString() ?? null,
    issueDate: p.issueDate?.toISOString() ?? null,
    expiryDate: p.expiryDate?.toISOString() ?? null,
    levy: p.levy?.toString() ?? null,
    notes: p.notes,
  }))

  const employeeForPass = {
    passportNumber: user.passportNumber,
    passportExpiry: user.passportExpiry?.toISOString() ?? null,
    company: user.company,
  }

  // Career journey events — shown on the "My Journey" tab of one's own profile.
  const careerEvents = isSelf
    ? await db.careerEvent.findMany({
        where: { userId: id },
        orderBy: { effectiveDate: 'asc' },
      })
    : []
  const serializedCareerEvents = careerEvents.map(e => ({
    id: e.id,
    type: e.type,
    title: e.title,
    detail: e.detail,
    fromValue: e.fromValue,
    toValue: e.toValue,
    effectiveDate: e.effectiveDate.toISOString(),
  }))

  return (
    <EmployeeProfile
      user={serialized}
      isAdmin={isAdmin}
      isSelf={isSelf}
      managers={managers}
      leaveBalances={serializedBalances}
      leaveRequests={serializedRequests}
      leaveAuditLogs={serializedAuditLogs}
      currentYear={currentYear}
      careerEvents={serializedCareerEvents}
      workPassSlot={
        isAdmin ? (
          <WorkPassManager userId={id} passes={serializedWorkPasses} employee={employeeForPass} />
        ) : undefined
      }
      offboardSlot={
        canOffboard && !isSelf && user.status === 'ACTIVE' ? (
          <OffboardDialog userId={id} employeeName={`${user.firstName} ${user.lastName}`} />
        ) : undefined
      }
    />
  )
}
