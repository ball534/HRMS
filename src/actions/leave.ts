'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { verifySession, requireRole } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import { calculateWorkingDays } from '@/lib/workingDays'
import { getOrCreateBalance } from '@/actions/leaveBalance'
import { computeAvailable } from '@/lib/leaveEntitlement'
import { uploadFile, getDownloadUrl } from '@/lib/google-drive'
import { findOverlappingBlackouts } from '@/actions/blackouts'

// ============================================================
// Types
// ============================================================

export type LeaveActionState = {
  success?: boolean
  error?: string
}

export type PreviewResult = {
  daysCount: number
  available: number
  sufficient: boolean
  unlimited: boolean
  error?: string
}

// ============================================================
// Zod schema
// ============================================================

const leaveRequestSchema = z.object({
  leaveTypeId: z.string().uuid(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  halfDay: z.enum(['NONE', 'AM', 'PM']),
  reason: z.string().optional(),
})

// ============================================================
// Helper: get years range from start/end date
// ============================================================

function getYears(startDate: Date, endDate: Date): number[] {
  const years = new Set<number>()
  years.add(startDate.getFullYear())
  years.add(endDate.getFullYear())
  return Array.from(years)
}

// ============================================================
// submitLeaveRequest
// ============================================================

export async function submitLeaveRequest(
  _state: LeaveActionState,
  formData: FormData
): Promise<LeaveActionState> {
  try {
    const session = await verifySession()

    // Parse raw fields
    const raw = {
      leaveTypeId: formData.get('leaveTypeId') as string,
      startDate: formData.get('startDate') as string,
      endDate: formData.get('endDate') as string,
      halfDay: (formData.get('halfDay') as string) || 'NONE',
      reason: (formData.get('reason') as string) || undefined,
    }

    const parsed = leaveRequestSchema.safeParse(raw)
    if (!parsed.success) {
      const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0]
      return { error: firstError ?? 'Invalid form data' }
    }

    const { leaveTypeId, halfDay, reason } = parsed.data
    const startDate = new Date(parsed.data.startDate)
    const endDate = new Date(parsed.data.endDate)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return { error: 'Invalid date format' }
    }

    if (startDate > endDate) {
      return { error: 'Start date must be before or equal to end date' }
    }

    // Fetch user
    const user = await db.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: {
        country: true,
        reportingManagerId: true,
        employmentType: true,
        startDate: true,
      },
    })

    if (!user.reportingManagerId) {
      return { error: 'You do not have a reporting manager assigned. Please contact your administrator.' }
    }

    // Fetch leave type
    const leaveType = await db.leaveType.findUniqueOrThrow({
      where: { id: leaveTypeId },
      select: {
        name: true,
        requiresAttachment: true,
        allowsHalfDay: true,
        defaultEntitlement: true,
      },
    })

    // Attachment enforcement
    const attachment = formData.get('attachment') as File | null
    const hasAttachment = attachment && attachment.size > 0

    if (leaveType.requiresAttachment && !hasAttachment) {
      return {
        error: `Attachment is required for ${leaveType.name}. Please upload a supporting document.`,
      }
    }

    // Half-day validation
    if (halfDay !== 'NONE' && !leaveType.allowsHalfDay) {
      return { error: `${leaveType.name} does not support half-day requests.` }
    }

    // Fetch public holidays for user's country
    const years = getYears(startDate, endDate)
    const holidays = await db.publicHoliday.findMany({
      where: {
        country: user.country,
        year: { in: years },
        isObserved: true,
      },
      select: { date: true },
    })

    // Calculate working days
    const daysCount = calculateWorkingDays(
      startDate,
      endDate,
      holidays.map(h => h.date),
      halfDay as 'NONE' | 'AM' | 'PM'
    )

    if (daysCount === 0) {
      return { error: 'No working days in selected date range.' }
    }

    // Blackout-window check (e.g. CNY, Hari Raya, year-end peaks)
    const overlapping = await findOverlappingBlackouts(user.country, startDate, endDate)
    const hardBlockers = overlapping.filter(b => b.hardBlock)
    if (hardBlockers.length > 0) {
      const names = hardBlockers.map(b => b.name).join(', ')
      return {
        error: `Leave during this period is blocked due to: ${names}. Talk to HR if it's an emergency.`,
      }
    }

    // Balance check (skip for types with defaultEntitlement === 0)
    const isUnlimited = leaveType.defaultEntitlement === 0
    if (!isUnlimited) {
      const balance = await getOrCreateBalance(session.userId, leaveTypeId, startDate.getFullYear())
      const available = computeAvailable(balance)

      if (daysCount > available) {
        return {
          error: `Insufficient balance. Available: ${available} days, requested: ${daysCount} days.`,
        }
      }
    }

    // Upload attachment to Google Drive if provided
    let attachmentKey: string | undefined
    let attachmentName: string | undefined

    if (hasAttachment && attachment) {
      attachmentName = attachment.name
      const buffer = Buffer.from(await attachment.arrayBuffer())

      const userForName = await db.user.findUnique({
        where: { id: session.userId },
        select: { firstName: true, lastName: true },
      })
      const employeeName = userForName ? `${userForName.firstName} ${userForName.lastName}` : 'Unknown'
      const fileName = `${employeeName} - ${new Date().toISOString().slice(0, 10)} - ${attachment.name}`

      const { fileId } = await uploadFile(
        buffer,
        fileName,
        attachment.type || 'application/octet-stream',
        ['Documents', employeeName, 'Leave Attachments'],
      )
      attachmentKey = fileId
    }

    // Create request + reserve pending balance in transaction
    const balanceUpdate =
      !isUnlimited
        ? [
            db.leaveBalance.updateMany({
              where: {
                userId: session.userId,
                leaveTypeId,
                year: startDate.getFullYear(),
              },
              data: { pending: { increment: daysCount } },
            }),
          ]
        : []

    const [request] = await db.$transaction([
      db.leaveRequest.create({
        data: {
          userId: session.userId,
          leaveTypeId,
          startDate,
          endDate,
          halfDay: halfDay as 'NONE' | 'AM' | 'PM',
          daysCount,
          reason,
          attachmentKey,
          attachmentName,
          status: 'PENDING',
          approverId: user.reportingManagerId,
        },
      }),
      ...balanceUpdate,
    ])

    await createAuditLog({
      userId: session.userId,
      action: 'LEAVE_SUBMITTED',
      entityType: 'LEAVE',
      entityId: request.id,
      details: { leaveTypeId, startDate: startDate.toISOString(), endDate: endDate.toISOString(), daysCount },
    })

    return { success: true }
  } catch (err) {
    console.error('submitLeaveRequest error:', err)
    return { error: 'Something went wrong. Please try again or contact your administrator.' }
  }
}

// ============================================================
// approveLeave
// ============================================================

export async function approveLeave(
  _state: LeaveActionState,
  formData: FormData
): Promise<LeaveActionState> {
  try {
    const session = await verifySession()

    const requestId = formData.get('requestId') as string
    const comment = (formData.get('comment') as string) || undefined

    if (!requestId) return { error: 'Request ID is required' }

    const request = await db.leaveRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { leaveType: true },
    })

    // Auth check
    if (session.userId !== request.approverId && session.role !== 'ADMIN' && session.role !== 'HR') {
      return { error: 'You are not authorised to approve this request.' }
    }

    if (request.status !== 'PENDING') {
      return { error: `Cannot approve a ${request.status.toLowerCase()} request.` }
    }

    const isUnlimited = request.leaveType.defaultEntitlement === 0
    const balanceUpdate =
      !isUnlimited
        ? [
            db.leaveBalance.updateMany({
              where: {
                userId: request.userId,
                leaveTypeId: request.leaveTypeId,
                year: request.startDate.getFullYear(),
              },
              data: {
                pending: { decrement: request.daysCount },
                used: { increment: request.daysCount },
              },
            }),
          ]
        : []

    await db.$transaction([
      db.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          approverId: session.userId,
          approvedAt: new Date(),
          rejectionReason: comment,
        },
      }),
      ...balanceUpdate,
    ])

    await createAuditLog({
      userId: session.userId,
      action: 'LEAVE_APPROVED',
      entityType: 'LEAVE',
      entityId: requestId,
      details: { comment },
    })

    return { success: true }
  } catch (err) {
    console.error('approveLeave error:', err)
    return { error: 'Something went wrong. Please try again.' }
  }
}

// ============================================================
// rejectLeave
// ============================================================

export async function rejectLeave(
  _state: LeaveActionState,
  formData: FormData
): Promise<LeaveActionState> {
  try {
    const session = await verifySession()

    const requestId = formData.get('requestId') as string
    const comment = (formData.get('comment') as string) || undefined

    if (!requestId) return { error: 'Request ID is required' }

    const request = await db.leaveRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { leaveType: true },
    })

    // Auth check
    if (session.userId !== request.approverId && session.role !== 'ADMIN' && session.role !== 'HR') {
      return { error: 'You are not authorised to reject this request.' }
    }

    if (request.status !== 'PENDING') {
      return { error: `Cannot reject a ${request.status.toLowerCase()} request.` }
    }

    const isUnlimited = request.leaveType.defaultEntitlement === 0
    const balanceUpdate =
      !isUnlimited
        ? [
            db.leaveBalance.updateMany({
              where: {
                userId: request.userId,
                leaveTypeId: request.leaveTypeId,
                year: request.startDate.getFullYear(),
              },
              data: {
                pending: { decrement: request.daysCount },
              },
            }),
          ]
        : []

    await db.$transaction([
      db.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          approverId: session.userId,
          rejectionReason: comment,
        },
      }),
      ...balanceUpdate,
    ])

    await createAuditLog({
      userId: session.userId,
      action: 'LEAVE_REJECTED',
      entityType: 'LEAVE',
      entityId: requestId,
      details: { comment },
    })

    return { success: true }
  } catch (err) {
    console.error('rejectLeave error:', err)
    return { error: 'Something went wrong. Please try again.' }
  }
}

// ============================================================
// cancelLeave
// ============================================================

export async function cancelLeave(
  _state: LeaveActionState,
  formData: FormData
): Promise<LeaveActionState> {
  try {
    const session = await verifySession()

    const requestId = formData.get('requestId') as string
    if (!requestId) return { error: 'Request ID is required' }

    const request = await db.leaveRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { leaveType: true },
    })

    // Auth check
    const isOwnPendingRequest =
      session.userId === request.userId && request.status === 'PENDING'
    const isAdminOrHR = session.role === 'ADMIN' || session.role === 'HR'

    if (!isOwnPendingRequest && !isAdminOrHR) {
      return { error: 'You are not authorised to cancel this request.' }
    }

    if (request.status === 'CANCELLED') {
      return { error: 'Request is already cancelled.' }
    }

    const isUnlimited = request.leaveType.defaultEntitlement === 0

    const updateRequest = db.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    })

    if (!isUnlimited && request.status === 'PENDING') {
      await db.$transaction([
        updateRequest,
        db.leaveBalance.updateMany({
          where: {
            userId: request.userId,
            leaveTypeId: request.leaveTypeId,
            year: request.startDate.getFullYear(),
          },
          data: { pending: { decrement: request.daysCount } },
        }),
      ])
    } else if (!isUnlimited && request.status === 'APPROVED') {
      await db.$transaction([
        updateRequest,
        db.leaveBalance.updateMany({
          where: {
            userId: request.userId,
            leaveTypeId: request.leaveTypeId,
            year: request.startDate.getFullYear(),
          },
          data: { used: { decrement: request.daysCount } },
        }),
      ])
    } else {
      await updateRequest
    }

    await createAuditLog({
      userId: session.userId,
      action: 'LEAVE_CANCELLED',
      entityType: 'LEAVE',
      entityId: requestId,
      details: { previousStatus: request.status },
    })

    return { success: true }
  } catch (err) {
    console.error('cancelLeave error:', err)
    return { error: 'Something went wrong. Please try again.' }
  }
}

// ============================================================
// deleteLeave — admin-only hard delete
// ============================================================

export async function deleteLeave(requestId: string): Promise<LeaveActionState> {
  try {
    const session = await requireRole(['ADMIN', 'HR'])

    const request = await db.leaveRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { leaveType: true, user: { select: { firstName: true, lastName: true } } },
    })

    const isUnlimited = request.leaveType.defaultEntitlement === 0

    // Reverse balance based on status
    const balanceWhere = {
      userId: request.userId,
      leaveTypeId: request.leaveTypeId,
      year: request.startDate.getFullYear(),
    }

    const operations = [db.leaveRequest.delete({ where: { id: requestId } })]
    if (!isUnlimited && request.status === 'APPROVED') {
      operations.push(
        db.leaveBalance.updateMany({ where: balanceWhere, data: { used: { decrement: request.daysCount } } }) as never
      )
    } else if (!isUnlimited && request.status === 'PENDING') {
      operations.push(
        db.leaveBalance.updateMany({ where: balanceWhere, data: { pending: { decrement: request.daysCount } } }) as never
      )
    }

    await db.$transaction(operations)

    await createAuditLog({
      userId: session.userId,
      action: 'LEAVE_DELETED',
      entityType: 'LEAVE',
      entityId: requestId,
      details: {
        employee: `${request.user.firstName} ${request.user.lastName}`,
        leaveType: request.leaveType.name,
        startDate: request.startDate.toISOString(),
        endDate: request.endDate.toISOString(),
        daysCount: request.daysCount,
        previousStatus: request.status,
      },
    })

    return { success: true }
  } catch (err) {
    console.error('deleteLeave error:', err)
    return { error: 'Failed to delete leave request.' }
  }
}

// ============================================================
// getLeaveRequests — not a form action, just async fetch
// ============================================================

export async function getLeaveRequests(userId?: string, status?: string) {
  const session = await verifySession()
  const targetUserId = userId ?? session.userId

  const whereClause: Record<string, unknown> = { userId: targetUserId }
  if (status) whereClause.status = status

  return db.leaveRequest.findMany({
    where: whereClause,
    include: {
      leaveType: true,
      user: { select: { firstName: true, lastName: true } },
      approver: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

// ============================================================
// getPendingApprovals
// ============================================================

export async function getPendingApprovals() {
  const session = await verifySession()

  return db.leaveRequest.findMany({
    where: {
      approverId: session.userId,
      status: 'PENDING',
    },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          department: true,
          country: true,
        },
      },
      leaveType: true,
    },
    orderBy: { createdAt: 'asc' },
  })
}

// ============================================================
// getAttachmentUrl
// ============================================================

export async function getAttachmentUrl(requestId: string) {
  const session = await verifySession()

  const request = await db.leaveRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: {
      userId: true,
      approverId: true,
      attachmentKey: true,
      attachmentName: true,
    },
  })

  // Auth: own request, approver, or HR/admin
  const isAuthorised =
    session.userId === request.userId ||
    session.userId === request.approverId ||
    session.role === 'ADMIN' ||
    session.role === 'HR'

  if (!isAuthorised) {
    return null
  }

  if (!request.attachmentKey) return null

  const url = await getDownloadUrl(request.attachmentKey)
  return { url, filename: request.attachmentName }
}

// ============================================================
// previewWorkingDays — called from LeaveRequestForm for live preview
// ============================================================

export async function previewWorkingDays(
  leaveTypeId: string,
  startDateStr: string,
  endDateStr: string,
  halfDay: 'NONE' | 'AM' | 'PM'
): Promise<PreviewResult> {
  if (!leaveTypeId || !startDateStr || !endDateStr) {
    return { daysCount: 0, available: 0, sufficient: false, unlimited: false }
  }

  const session = await verifySession()

  const startDate = new Date(startDateStr)
  const endDate = new Date(endDateStr)

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
    return { daysCount: 0, available: 0, sufficient: false, unlimited: false }
  }

  try {
    const [user, leaveType] = await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: session.userId },
        select: { country: true },
      }),
      db.leaveType.findUniqueOrThrow({
        where: { id: leaveTypeId },
        select: { defaultEntitlement: true },
      }),
    ])

    const years = getYears(startDate, endDate)
    const holidays = await db.publicHoliday.findMany({
      where: {
        country: user.country,
        year: { in: years },
        isObserved: true,
      },
      select: { date: true },
    })

    const daysCount = calculateWorkingDays(
      startDate,
      endDate,
      holidays.map(h => h.date),
      halfDay
    )

    const isUnlimited = leaveType.defaultEntitlement === 0

    if (isUnlimited) {
      return { daysCount, available: 0, sufficient: true, unlimited: true }
    }

    const balance = await getOrCreateBalance(session.userId, leaveTypeId, startDate.getFullYear())
    const available = computeAvailable(balance)

    return {
      daysCount,
      available,
      sufficient: daysCount <= available,
      unlimited: false,
    }
  } catch {
    return { daysCount: 0, available: 0, sufficient: false, unlimited: false, error: 'Preview failed' }
  }
}
