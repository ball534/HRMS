import 'server-only'

import { db } from '@/lib/db'
import { can } from '@/lib/permissions'
import { getLeaveAuditLogs } from '@/lib/audit'
import type { VerifiedSession } from '@/lib/dal'

/**
 * Loading an employee profile, in one place.
 *
 * Two screens render the same profile: `/people/[id]`, where HR or a manager
 * looks at somebody, and the dashboard's own-profile tab, where you look at
 * yourself. The loading, serialization (Prisma `Decimal` and `Date` values
 * cannot cross into a Client Component) and — most importantly — the
 * authorization used to exist only on the page, so a second caller meant a
 * second copy of the rules.
 *
 * The rules:
 *
 *   yourself   always allowed.
 *   HR         allowed, with the identity records, leave admin and work passes.
 *   manager    allowed for someone in their own department, read-only, and
 *              without the HR sections.
 *   anyone else refused.
 */

export type ProfileAccess = 'self' | 'hr' | 'department' | 'denied'

export async function resolveProfileAccess(
  employeeId: string,
  session: VerifiedSession,
): Promise<ProfileAccess> {
  if (employeeId === session.userId) return 'self'
  if (can(session.role, 'people.read.directory')) return 'hr'

  if (can(session.role, 'people.read.department')) {
    const [viewer, subject] = await Promise.all([
      db.user.findUnique({ where: { id: session.userId }, select: { department: true } }),
      db.user.findUnique({ where: { id: employeeId }, select: { department: true } }),
    ])
    const sameDepartment =
      Boolean(viewer?.department) && viewer?.department === subject?.department
    return sameDepartment ? 'department' : 'denied'
  }

  return 'denied'
}

/**
 * Everything the profile component needs, serialized. Returns null when the
 * employee does not exist; the caller decides what that means (a 404 on the HR
 * page, a redirect on the dashboard).
 */
export async function loadEmployeeProfile(employeeId: string, session: VerifiedSession) {
  const access = await resolveProfileAccess(employeeId, session)
  if (access === 'denied') return null

  // The HR sections — identity records, leave balances, audit trail, work passes
  // — are gated on the capability, not on whose profile it is. Someone looking
  // at their own profile sees their own record, not an HR console for it.
  const isHrView = can(session.role, 'people.write')
  const isSelf = access === 'self'
  const currentYear = new Date().getFullYear()

  const user = await db.user.findUnique({
    where: { id: employeeId },
    include: {
      reportingManager: { select: { id: true, firstName: true, lastName: true } },
      directReports: { select: { id: true, firstName: true, lastName: true, position: true } },
    },
  })
  if (!user) return null

  const [managers, leaveBalances, leaveRequests, auditLogs, workPasses, careerEvents] =
    await Promise.all([
      isHrView
        ? db.user.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, firstName: true, lastName: true },
            orderBy: { firstName: 'asc' },
          })
        : [],
      isHrView
        ? db.leaveBalance.findMany({
            where: { userId: employeeId, year: currentYear },
            include: { leaveType: { select: { name: true } } },
            orderBy: { leaveType: { name: 'asc' } },
          })
        : [],
      isHrView
        ? db.leaveRequest.findMany({
            where: { userId: employeeId },
            include: {
              leaveType: { select: { name: true } },
              approver: { select: { firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          })
        : [],
      isHrView ? getLeaveAuditLogs(employeeId) : [],
      // Work passes: HR sees them to manage, and you see your own to read.
      isHrView || isSelf
        ? db.workPass.findMany({
            where: { userId: employeeId },
            include: {
              documents: {
                select: { id: true, blobId: true, fileName: true, label: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        : [],
      isSelf
        ? db.careerEvent.findMany({
            where: { userId: employeeId },
            orderBy: { effectiveDate: 'asc' },
          })
        : [],
    ])

  const { passwordHash: _passwordHash, ...rest } = user

  return {
    access,
    isHrView,
    isSelf,
    currentYear,
    /** Decimal and Date columns become strings — a Client Component cannot take either. */
    user: {
      ...rest,
      hourlyRate: rest.hourlyRate?.toString() ?? null,
      hourlyRateWeekday: rest.hourlyRateWeekday?.toString() ?? null,
      hourlyRateSaturday: rest.hourlyRateSaturday?.toString() ?? null,
      hourlyRateSundayPh: rest.hourlyRateSundayPh?.toString() ?? null,
      hourlyRateWeekend: rest.hourlyRateWeekend?.toString() ?? null,
      normalDailyHours: rest.normalDailyHours?.toString() ?? null,
      dateOfBirth: rest.dateOfBirth?.toISOString() ?? null,
      startDate: rest.startDate?.toISOString() ?? null,
      terminatedAt: rest.terminatedAt?.toISOString() ?? null,
      passportExpiry: rest.passportExpiry?.toISOString() ?? null,
      probationEndDate: rest.probationEndDate?.toISOString() ?? null,
      confirmationDate: rest.confirmationDate?.toISOString() ?? null,
      createdAt: rest.createdAt.toISOString(),
      updatedAt: rest.updatedAt.toISOString(),
    },
    managers,
    leaveBalances: leaveBalances.map(b => ({
      id: b.id,
      leaveTypeName: b.leaveType.name,
      entitlement: b.entitlement,
      used: b.used,
      pending: b.pending,
      carryForward: b.carryForward,
      adjustment: b.adjustment,
      available: b.entitlement + b.carryForward + b.adjustment - b.used - b.pending,
    })),
    leaveRequests: leaveRequests.map(r => ({
      id: r.id,
      leaveTypeName: r.leaveType.name,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      daysCount: r.daysCount,
      status: r.status,
      reason: r.reason,
      approver: r.approver ? `${r.approver.firstName} ${r.approver.lastName}` : null,
      createdAt: r.createdAt.toISOString(),
    })),
    leaveAuditLogs: auditLogs.map(log => ({
      id: log.id,
      action: log.action,
      actor: `${log.user.firstName} ${log.user.lastName}`,
      details: log.details as Record<string, unknown> | null,
      createdAt: log.createdAt.toISOString(),
    })),
    workPasses: workPasses.map(p => ({
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
      documents: p.documents.map(d => ({
        id: d.id,
        blobId: d.blobId,
        fileName: d.fileName,
        label: d.label,
        createdAt: d.createdAt.toISOString(),
      })),
    })),
    employeeForPass: {
      passportNumber: user.passportNumber,
      passportExpiry: user.passportExpiry?.toISOString() ?? null,
      company: user.company,
    },
    careerEvents: careerEvents.map(e => ({
      id: e.id,
      type: e.type,
      title: e.title,
      detail: e.detail,
      fromValue: e.fromValue,
      toValue: e.toValue,
      effectiveDate: e.effectiveDate.toISOString(),
    })),
  }
}
