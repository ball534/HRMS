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
