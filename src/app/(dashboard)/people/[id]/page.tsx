import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { db } from '@/lib/db'
import { getLeaveAuditLogs } from '@/lib/audit'
import { EmployeeProfile } from '@/components/people/EmployeeProfile'
import { WorkPassManager } from '@/components/people/WorkPassManager'

type Props = {
  params: Promise<{ id: string }>
}

export default async function PersonPage({ params }: Props) {
  const { id } = await params
  const session = await verifySession()
  const isAdmin = session.role === 'ADMIN'
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
    issueDate: p.issueDate?.toISOString() ?? null,
    expiryDate: p.expiryDate?.toISOString() ?? null,
    levy: p.levy?.toString() ?? null,
    notes: p.notes,
  }))

  return (
    <div className="space-y-6">
      <EmployeeProfile
        user={serialized}
        isAdmin={isAdmin}
        managers={managers}
        leaveBalances={serializedBalances}
        leaveRequests={serializedRequests}
        leaveAuditLogs={serializedAuditLogs}
        currentYear={currentYear}
      />
      {isAdmin && <WorkPassManager userId={id} passes={serializedWorkPasses} />}
    </div>
  )
}
