'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { notify, notifyHr } from '@/lib/notify'
import { tryResolveApprover } from '@/lib/approvers'
import { calculateAnnualEntitlement } from '@/lib/leaveEntitlement'
import { resolveRules } from '@/lib/statutory'

/**
 * Offboarding.
 *
 * Termination used to be a status change on a dropdown. It flipped `status` to
 * TERMINATED, stamped `terminatedAt`, and archived the employee's Drive
 * folder. Everything else the departure implied was left behind:
 *
 *   - their direct reports kept pointing at a user who could no longer log in,
 *     which also broke the org chart for the whole company;
 *   - leave requests and timesheets sitting in their approval
 *     queue were stranded there permanently, with balances still held pending;
 *   - their own pending requests stayed pending forever;
 *   - performance reviews they owned became unactionable, and their own review
 *     sat at "awaiting employee" indefinitely, skewing completion reporting;
 *   - leave entitlement was never prorated, so a February leaver kept a full
 *     year's allowance and final pay could not be settled;
 *   - work passes were left as though still valid.
 *
 * This action does the whole thing in one place, records what it did, and tells
 * the people who inherit the work.
 *
 * Session revocation is handled separately and immediately: `verifySession`
 * (src/lib/dal.ts) re-reads status from the database on every request, so the
 * moment this commits the leaver's cookie stops working — including for a
 * terminated ADMIN, who previously kept full access until their 7-day JWT
 * expired.
 */

export type OffboardingResult = {
  success?: boolean
  error?: string
  summary?: {
    reportsReassigned: number
    leaveApprovalsReassigned: number
    timesheetApprovalsReassigned: number
    ownRequestsCancelled: number
    reviewsReassigned: number
    ownReviewsWaived: number
    passesFlagged: number
    proratedLeaveTypes: number
    successorName: string
  }
}

export type OffboardingPreview = {
  employeeName: string
  directReports: number
  pendingLeaveApprovals: number
  pendingTimesheetApprovals: number
  ownPendingRequests: number
  reviewsAsManager: number
  activePasses: number
  suggestedSuccessorId: string | null
  candidates: { id: string; name: string; role: string }[]
}

/**
 * What offboarding this person will touch — shown before anything is changed,
 * so the person running it can pick the right successor knowingly.
 */
export async function getOffboardingPreview(userId: string): Promise<OffboardingPreview | { error: string }> {
  const session = await verifySession()
  if (!can(session.role, 'people.offboard')) {
    return { error: 'You do not have permission to offboard employees' }
  }

  const employee = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true, lastName: true, reportingManagerId: true },
  })
  if (!employee) return { error: 'Employee not found' }

  const [
    directReports,
    pendingLeaveApprovals,
    pendingTimesheetApprovals,
    ownPendingRequests,
    reviewsAsManager,
    activePasses,
    candidates,
  ] = await Promise.all([
    db.user.count({ where: { reportingManagerId: userId, status: 'ACTIVE' } }),
    db.leaveRequest.count({ where: { approverId: userId, status: 'PENDING' } }),
    db.timeEntry.count({ where: { approverId: userId, status: 'SUBMITTED' } }),
    db.leaveRequest.count({ where: { userId, status: 'PENDING' } }),
    db.performanceReview.count({
      where: { managerId: userId, status: { not: 'ACKNOWLEDGED' } },
    }),
    db.workPass.count({ where: { userId, passType: { not: 'NONE' } } }),
    db.user.findMany({
      where: { status: 'ACTIVE', id: { not: userId } },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
  ])

  // Default the successor to the leaver's own manager — the person most likely
  // to pick up their team and their queue.
  const suggested = employee.reportingManagerId
    ? candidates.find(c => c.id === employee.reportingManagerId)?.id ?? null
    : null

  return {
    employeeName: `${employee.firstName} ${employee.lastName}`,
    directReports,
    pendingLeaveApprovals,
    pendingTimesheetApprovals,
    ownPendingRequests,
    reviewsAsManager,
    activePasses,
    suggestedSuccessorId: suggested,
    candidates: candidates.map(c => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      role: c.role,
    })),
  }
}

export async function offboardEmployee(input: {
  userId: string
  /** Last working day. Drives leave proration. Defaults to today. */
  effectiveDate?: string
  /** Who inherits the reports and the approval queue. */
  successorId?: string
  reason?: string
}): Promise<OffboardingResult> {
  try {
    const session = await verifySession()

    if (!can(session.role, 'people.offboard')) {
      return { error: 'You do not have permission to offboard employees' }
    }

    const employee = await db.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        employmentType: true,
        startDate: true,
        reportingManagerId: true,
        country: true,
        // Needed so the archive targets the same folder name that was created
        // at hire time — getEmployeeFolderName prefers employeeNumber over id.
        employeeNumber: true,
      },
    })
    if (!employee) return { error: 'Employee not found' }

    if (employee.status === 'TERMINATED') {
      return { error: 'This employee has already been offboarded' }
    }

    // --- Guards -------------------------------------------------------------

    // Offboarding yourself locks you out mid-flow and leaves the rest of the
    // steps half-run.
    if (employee.id === session.userId) {
      return { error: 'You cannot offboard yourself. Ask someone else on the HR team to do it.' }
    }

    // Never leave the organisation with nobody holding full access. HR is the
    // only role that can administer the system, so offboarding the last active
    // HR user would lock everyone out of hiring, letters, payroll and settings
    // with no way back in through the app.
    if (employee.role === 'HR') {
      const otherHr = await db.user.count({
        where: { role: 'HR', status: 'ACTIVE', id: { not: employee.id } },
      })
      if (otherHr === 0) {
        return {
          error:
            'This is the only active HR account. Give someone else the HR role before offboarding them.',
        }
      }
    }

    // --- Successor ----------------------------------------------------------

    let successorId = input.successorId ?? null
    if (successorId) {
      const successor = await db.user.findUnique({
        where: { id: successorId },
        select: { id: true, status: true },
      })
      if (!successor || successor.status !== 'ACTIVE') {
        return { error: 'The chosen successor is not an active employee' }
      }
      if (successorId === employee.id) {
        return { error: 'The successor cannot be the person leaving' }
      }
    } else {
      // Fall back to the standard approver chain rather than refusing.
      const resolved = await tryResolveApprover(employee.id)
      successorId = resolved?.approverId ?? null
    }

    if (!successorId) {
      return {
        error:
          'No successor could be determined for this employee. Choose one, or set a fallback approver in Settings → Approvals.',
      }
    }

    const successor = await db.user.findUniqueOrThrow({
      where: { id: successorId },
      select: { id: true, firstName: true, lastName: true },
    })
    const successorName = `${successor.firstName} ${successor.lastName}`
    const effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : new Date()
    const now = new Date()

    // --- 1. Direct reports --------------------------------------------------
    // Left pointing at a departed manager, this both stranded approvals and
    // made the whole-company org chart throw (orphaned nodes break stratify).
    const reports = await db.user.findMany({
      where: { reportingManagerId: employee.id, status: 'ACTIVE' },
      select: { id: true },
    })
    if (reports.length) {
      await db.user.updateMany({
        where: { id: { in: reports.map(r => r.id) } },
        data: { reportingManagerId: successorId },
      })
      await createAuditLog({
        userId: session.userId,
        action: 'DIRECT_REPORTS_REASSIGNED',
        entityType: 'USER',
        entityId: employee.id,
        details: { count: reports.length, from: employee.id, to: successorId },
      })
    }

    // --- 2. Re-route their approval queue -----------------------------------
    const [leaveQueue, timeQueue] = await Promise.all([
      db.leaveRequest.findMany({
        where: { approverId: employee.id, status: 'PENDING' },
        select: { id: true },
      }),
      db.timeEntry.findMany({
        where: { approverId: employee.id, status: 'SUBMITTED' },
        select: { id: true },
      }),
    ])

    if (leaveQueue.length) {
      await db.leaveRequest.updateMany({
        where: { id: { in: leaveQueue.map(r => r.id) } },
        data: { approverId: successorId },
      })
    }
    if (timeQueue.length) {
      await db.timeEntry.updateMany({
        where: { id: { in: timeQueue.map(e => e.id) } },
        data: { approverId: successorId },
      })
    }
    const reassignedTotal = leaveQueue.length + timeQueue.length
    if (reassignedTotal) {
      await createAuditLog({
        userId: session.userId,
        action: 'APPROVALS_REASSIGNED',
        entityType: 'USER',
        entityId: employee.id,
        details: {
          from: employee.id,
          to: successorId,
          leave: leaveQueue.length,
          timesheets: timeQueue.length,
        },
      })
      await notify({
        userId: successorId,
        type: 'APPROVAL_REASSIGNED',
        title: `${reassignedTotal} approval(s) reassigned to you`,
        body: `${employee.firstName} ${employee.lastName} has left. Their pending approvals (${leaveQueue.length} leave, ${timeQueue.length} timesheet) are now yours.`,
        linkUrl: '/dashboard?tab=approvals',
      })
    }

    // --- 3. Their own pending requests --------------------------------------
    // A leaver's pending leave can't be approved after they've gone, and the
    // days are still held against their balance.
    const ownPending = await db.leaveRequest.findMany({
      where: { userId: employee.id, status: 'PENDING' },
      include: { leaveType: true },
    })
    for (const request of ownPending) {
      const isUnlimited = request.leaveType.defaultEntitlement === 0
      await db.leaveRequest.update({
        where: { id: request.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          rejectionReason: 'Automatically cancelled on offboarding',
        },
      })
      if (!isUnlimited) {
        await db.leaveBalance.updateMany({
          where: {
            userId: employee.id,
            leaveTypeId: request.leaveTypeId,
            year: request.startDate.getFullYear(),
          },
          data: { pending: { decrement: request.daysCount } },
        })
      }
      await createAuditLog({
        userId: session.userId,
        action: 'LEAVE_CANCELLED',
        entityType: 'LEAVE',
        entityId: request.id,
        details: { offboarding: true, previousStatus: 'PENDING' },
      })
    }

    // --- 4. Performance reviews ---------------------------------------------
    // Reviews they owned move to the successor; their own open review is
    // waived so it stops sitting at "awaiting employee" forever and skewing
    // every completion report.
    const reviewsAsManager = await db.performanceReview.findMany({
      where: { managerId: employee.id, status: { not: 'ACKNOWLEDGED' } },
      select: { id: true },
    })
    if (reviewsAsManager.length) {
      await db.performanceReview.updateMany({
        where: { id: { in: reviewsAsManager.map(r => r.id) } },
        data: { managerId: successorId },
      })
    }

    const ownOpenReviews = await db.performanceReview.findMany({
      where: { employeeId: employee.id, status: 'PENDING_ACKNOWLEDGEMENT' },
      select: { id: true },
    })
    if (ownOpenReviews.length) {
      await db.performanceReview.updateMany({
        where: { id: { in: ownOpenReviews.map(r => r.id) } },
        data: { status: 'ACKNOWLEDGED', acknowledgedAt: now },
      })
      for (const r of ownOpenReviews) {
        await createAuditLog({
          userId: session.userId,
          action: 'REVIEW_ACKNOWLEDGED',
          entityType: 'PERFORMANCE_REVIEW',
          entityId: r.id,
          details: {
            waivedOnOffboarding: true,
            note: 'Employee left before acknowledging; waived by HR so the cycle can complete.',
          },
        })
      }
    }

    // --- 5. Leave proration for final settlement ----------------------------
    // Someone leaving in February kept a full year's entitlement, so final pay
    // could not be settled correctly. Write the prorated figure into
    // `entitlementOverride` — the value the balance maths already prefers —
    // rather than silently rewriting `entitlement`, so the original
    // calculation is still visible next to it.
    const year = effectiveDate.getFullYear()
    // The leaver's own country rules as at their last working day.
    const { rules: leaveRules } = await resolveRules(employee.country, effectiveDate)
    const balances = await db.leaveBalance.findMany({
      where: { userId: employee.id, year },
      include: { leaveType: { select: { name: true, defaultEntitlement: true } } },
    })
    let proratedCount = 0
    for (const balance of balances) {
      if (balance.leaveType.defaultEntitlement === 0) continue // unlimited types
      if (!employee.startDate) continue

      const full = calculateAnnualEntitlement(
        employee.employmentType as 'EMPLOYEE' | 'CONTRACTOR' | 'PART_TIME',
        employee.startDate,
        year,
        leaveRules.annualLeave,
      )
      // Months served this year, up to and including the leaving month.
      const monthsServed = effectiveDate.getMonth() + 1
      const prorated = Math.floor(((full * monthsServed) / 12) * 2) / 2

      await db.leaveBalance.update({
        where: { id: balance.id },
        data: { entitlementOverride: prorated },
      })
      await createAuditLog({
        userId: session.userId,
        action: 'BALANCE_ADJUSTED',
        entityType: 'LEAVE',
        entityId: balance.id,
        details: {
          offboardingProration: true,
          targetUserId: employee.id,
          leaveType: balance.leaveType.name,
          fullEntitlement: full,
          proratedTo: prorated,
          monthsServed,
          effectiveDate: effectiveDate.toISOString(),
        },
      })
      proratedCount++
    }

    // --- 6. Work passes -----------------------------------------------------
    // A pass tied to employment must be cancelled with the authorities. The app
    // can't do that, but it must stop presenting the pass as live and must tell
    // HR it needs doing.
    const passes = await db.workPass.findMany({
      where: { userId: employee.id, passType: { not: 'NONE' } },
      select: { id: true, passType: true, notes: true },
    })
    for (const pass of passes) {
      await db.workPass.update({
        where: { id: pass.id },
        data: {
          notes: [
            pass.notes,
            `[${now.toISOString().slice(0, 10)}] Employee offboarded — pass requires cancellation with the authorities.`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      })
    }
    if (passes.length) {
      await notifyHr({
        type: 'WORK_PASS_EXPIRING',
        title: `Work pass cancellation needed: ${employee.firstName} ${employee.lastName}`,
        body: `${employee.firstName} ${employee.lastName} has been offboarded holding ${passes.length} pass(es): ${passes.map(p => p.passType).join(', ')}. These must be cancelled with the relevant authority.`,
        linkUrl: '/admin/work-passes',
      })
    }

    // --- 7. Finally, the status change --------------------------------------
    await db.user.update({
      where: { id: employee.id },
      data: {
        status: 'TERMINATED',
        terminatedAt: effectiveDate,
      },
    })

    await createAuditLog({
      userId: session.userId,
      action: 'USER_OFFBOARDED',
      entityType: 'USER',
      entityId: employee.id,
      details: {
        effectiveDate: effectiveDate.toISOString(),
        successorId,
        reason: input.reason ?? null,
        reportsReassigned: reports.length,
        approvalsReassigned: reassignedTotal,
        ownRequestsCancelled: ownPending.length,
        reviewsReassigned: reviewsAsManager.length,
        ownReviewsWaived: ownOpenReviews.length,
        passesFlagged: passes.length,
        proratedLeaveTypes: proratedCount,
      },
    })

    await db.careerEvent.create({
      data: {
        userId: employee.id,
        type: 'TERMINATED',
        title: 'Left the company',
        detail: input.reason ?? null,
        effectiveDate,
      },
    })

    // No Drive folder to archive: documents live in Postgres against the
    // employee's id and are retained after they leave, which is what statutory
    // record-keeping requires. Nothing to move or copy.

    revalidatePath('/people')
    revalidatePath(`/people/${employee.id}`)
    revalidatePath('/people/org-chart')
    revalidatePath('/dashboard')

    return {
      success: true,
      summary: {
        reportsReassigned: reports.length,
        leaveApprovalsReassigned: leaveQueue.length,
        timesheetApprovalsReassigned: timeQueue.length,
        ownRequestsCancelled: ownPending.length,
        reviewsReassigned: reviewsAsManager.length,
        ownReviewsWaived: ownOpenReviews.length,
        passesFlagged: passes.length,
        proratedLeaveTypes: proratedCount,
        successorName,
      },
    }
  } catch (err) {
    console.error('offboardEmployee error:', err)
    return { error: 'Offboarding failed. No further changes were made — check the logs and retry.' }
  }
}
