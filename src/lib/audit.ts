import { db } from '@/lib/db'
import type { AuditAction, AuditEntityType } from '@/generated/prisma/client'

/**
 * Fetch leave-related audit logs for a specific employee.
 * Includes: who performed it, what action, when, and details.
 */
export async function getLeaveAuditLogs(userId: string) {
  // Get all audit logs where:
  // 1. The user performed the action on their own leave, OR
  // 2. Someone else acted on a leave that belongs to this user
  const leaveActions: AuditAction[] = [
    'LEAVE_SUBMITTED',
    'LEAVE_APPROVED',
    'LEAVE_REJECTED',
    'LEAVE_CANCELLED',
    'LEAVE_DELETED',
    'BALANCE_ADJUSTED',
  ]

  // First get all leave request IDs for this user
  const userLeaveRequests = await db.leaveRequest.findMany({
    where: { userId },
    select: { id: true },
  })
  const leaveRequestIds = userLeaveRequests.map(r => r.id)

  return db.auditLog.findMany({
    where: {
      action: { in: leaveActions },
      OR: [
        // Actions by the user themselves
        { userId, action: { in: ['LEAVE_SUBMITTED'] } },
        // Actions on the user's leave requests
        { entityId: { in: leaveRequestIds }, entityType: 'LEAVE' },
        // Balance adjustments targeting this user
        {
          action: 'BALANCE_ADJUSTED',
          details: { path: ['targetUserId'], equals: userId },
        },
      ],
    },
    include: {
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

/**
 * Filtered audit log for the governance screen.
 *
 * Audit rows were being written for expenses, timesheets, holidays, rewards,
 * letters and work passes and then never surfaced anywhere — `getLeaveAuditLogs`
 * above was the only reader in the product, and only for leave. So the data
 * existed but no question could be asked of it.
 */
export type AuditLogFilters = {
  actorId?: string
  entityType?: AuditEntityType
  action?: AuditAction
  entityId?: string
  from?: Date
  to?: Date
  /** Only reversals and other exception events. */
  exceptionsOnly?: boolean
  take?: number
  skip?: number
}

/** Actions that represent an override, reversal or data egress. */
export const EXCEPTION_ACTIONS: AuditAction[] = [
  'LEAVE_REVERSED',
  'EXPENSE_REVERSED',
  'TIME_ENTRY_REVERSED',
  'REVIEW_CYCLE_REVERSED',
  'PERFORMANCE_REVIEW_REVERSED',
  'REWARD_CYCLE_REVERSED',
  'REWARD_ALLOCATION_REVERSED',
  'EMPLOYMENT_LETTER_REVERSED',
  'LEARNING_LOCKOUT_REVERSED',
  'PAYROLL_EXPORTED',
  'EXPENSE_EXPORTED',
  'RATINGS_EXPORTED',
  'LEAVE_DELETED',
  'EXPENSE_DELETED',
  'TIME_ENTRY_DELETED',
  'TIME_ENTRY_UNLOCKED',
  'USER_OFFBOARDED',
  'SETTING_UPDATED',
  'STATUTORY_RULES_CREATED',
]

export async function queryAuditLogs(filters: AuditLogFilters = {}) {
  const take = Math.min(filters.take ?? 100, 500)

  const where = {
    ...(filters.actorId ? { userId: filters.actorId } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.action
      ? { action: filters.action }
      : filters.exceptionsOnly
        ? { action: { in: EXCEPTION_ACTIONS } }
        : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take,
      skip: filters.skip ?? 0,
    }),
    db.auditLog.count({ where }),
  ])

  return { rows, total }
}

export async function createAuditLog({
  userId,
  action,
  entityType,
  entityId,
  details,
  ipAddress,
}: {
  userId: string
  action: AuditAction
  entityType: AuditEntityType
  entityId?: string
  details?: Record<string, unknown>
  ipAddress?: string
}) {
  return db.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      details: details ? (details as Parameters<typeof db.auditLog.create>[0]['data']['details']) : undefined,
      ipAddress,
    },
  })
}
