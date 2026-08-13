import 'server-only'

import { db } from '@/lib/db'
import { can, type Capability } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { notify } from '@/lib/notify'
import type { AuditAction, AuditEntityType } from '@/generated/prisma/client'

/**
 * Terminal-state reversal.
 *
 * The same shape recurred in every module: a state you could enter but never
 * leave. A test lockout with no reset anywhere in the product. A review cycle
 * closed a week early by mis-click, with no reopen. A bonus of 50,000 where
 * 5,000 was meant, correctable only by cancelling. A rejected expense that
 * could never be fixed and resubmitted. An accidentally cancelled leave
 * request whose only remedy was an admin hard-delete. A rejected employment
 * letter that could never be re-drafted.
 *
 * Rather than six bespoke escape hatches, this is one audited operation:
 *
 *   await reverseState({
 *     entityType: 'REVIEW_CYCLE',
 *     entityId: cycleId,
 *     to: 'EVALUATION',
 *     reason: 'Closed in error before the Kuala Lumpur team submitted',
 *     actorId: session.userId,
 *     actorRole: session.role,
 *   })
 *
 * Every reversal:
 *   - is checked against an explicit allowed-transition table (below), so this
 *     can't be used to put a record into a state its own workflow forbids;
 *   - requires the capability that governs that module;
 *   - requires a written reason of at least 10 characters;
 *   - writes a dedicated `*_REVERSED` audit row carrying the reason, the state
 *     it came from and the state it went to;
 *   - notifies the affected employee where there is one.
 *
 * A reversal is never silent and never hidden. That is the point: the escape
 * hatch exists so people aren't stuck, and the audit row exists so using it is
 * visible.
 */

export const MIN_REASON_LENGTH = 10

export type ReversibleEntityType =
  | 'LEAVE'
  | 'EXPENSE'
  | 'TIME_ENTRY'
  | 'REVIEW_CYCLE'
  | 'PERFORMANCE_REVIEW'
  | 'REWARD_CYCLE'
  | 'REWARD_ALLOCATION'
  | 'EMPLOYMENT_LETTER'
  | 'LEARNING'

export type ReversalInput = {
  entityType: ReversibleEntityType
  /**
   * The record's id. For LEARNING there is no single id the UI holds, so this
   * is `"<userId>:<testId>"` — see `learningLockKey`.
   */
  entityId: string
  /** Target state. Must be listed as a valid target for the current state. */
  to: string
  reason: string
  actorId: string
  actorRole: string
}

export type ReversalResult = { success: true; from: string; to: string } | { success: false; error: string }

/** Compose the entityId for a learning test lockout reversal. */
export function learningLockKey(userId: string, testId: string): string {
  return `${userId}:${testId}`
}

// ============================================================
// What may be reversed, to where, by whom
// ============================================================

type TransitionRule = {
  from: string
  to: string
  /** Shown in the UI as the button/description for this reversal. */
  label: string
}

type EntitySpec = {
  capability: Capability
  auditAction: AuditAction
  auditEntityType: AuditEntityType
  /** Human name used in error messages and notifications. */
  noun: string
  transitions: TransitionRule[]
}

const SPECS: Record<ReversibleEntityType, EntitySpec> = {
  LEAVE: {
    capability: 'leave.admin',
    auditAction: 'LEAVE_REVERSED',
    auditEntityType: 'LEAVE',
    noun: 'leave request',
    transitions: [
      { from: 'CANCELLED', to: 'PENDING', label: 'Restore a cancelled request for re-approval' },
      { from: 'REJECTED', to: 'PENDING', label: 'Reopen a rejected request for reconsideration' },
    ],
  },
  EXPENSE: {
    capability: 'expense.admin',
    auditAction: 'EXPENSE_REVERSED',
    auditEntityType: 'EXPENSE',
    noun: 'expense claim',
    transitions: [
      { from: 'REJECTED', to: 'DRAFT', label: 'Return to the employee to correct and resubmit' },
      { from: 'REIMBURSED', to: 'APPROVED', label: 'Un-mark as paid (e.g. the bank payment bounced)' },
    ],
  },
  TIME_ENTRY: {
    capability: 'time.admin',
    auditAction: 'TIME_ENTRY_REVERSED',
    auditEntityType: 'TIME_ENTRY',
    noun: 'timesheet entry',
    transitions: [
      { from: 'APPROVED', to: 'DRAFT', label: 'Unlock an entry approved in error' },
      { from: 'REJECTED', to: 'SUBMITTED', label: 'Put a rejected day back in the approval queue' },
    ],
  },
  REVIEW_CYCLE: {
    capability: 'performance.admin',
    auditAction: 'REVIEW_CYCLE_REVERSED',
    auditEntityType: 'REVIEW_CYCLE',
    noun: 'review cycle',
    transitions: [
      { from: 'CLOSED', to: 'EVALUATION', label: 'Reopen for late reviews, corrections or appeals' },
    ],
  },
  PERFORMANCE_REVIEW: {
    capability: 'performance.admin',
    auditAction: 'PERFORMANCE_REVIEW_REVERSED',
    auditEntityType: 'PERFORMANCE_REVIEW',
    noun: 'performance review',
    transitions: [
      {
        from: 'PENDING_ACKNOWLEDGEMENT',
        to: 'IN_EVALUATION',
        label: 'Send back to the reviewer to correct before the employee signs',
      },
      { from: 'ACKNOWLEDGED', to: 'IN_EVALUATION', label: 'Reopen after acknowledgement (appeal upheld)' },
    ],
  },
  REWARD_CYCLE: {
    capability: 'rewards.admin',
    auditAction: 'REWARD_CYCLE_REVERSED',
    auditEntityType: 'REWARD_CYCLE',
    noun: 'reward cycle',
    transitions: [
      { from: 'APPROVED', to: 'DRAFT', label: 'Reopen to correct allocations before payout' },
      { from: 'CLOSED', to: 'APPROVED', label: 'Reopen a cycle closed before anyone was paid' },
    ],
  },
  REWARD_ALLOCATION: {
    capability: 'rewards.admin',
    auditAction: 'REWARD_ALLOCATION_REVERSED',
    auditEntityType: 'REWARD_ALLOCATION',
    noun: 'bonus allocation',
    transitions: [
      { from: 'APPROVED', to: 'DRAFT', label: 'Correct an approved amount' },
      { from: 'CANCELLED', to: 'DRAFT', label: 'Un-cancel an allocation' },
    ],
  },
  EMPLOYMENT_LETTER: {
    capability: 'letters.write',
    auditAction: 'EMPLOYMENT_LETTER_REVERSED',
    auditEntityType: 'EMPLOYMENT_LETTER',
    noun: 'letter',
    transitions: [
      { from: 'REJECTED', to: 'PENDING_REVIEW', label: 'Re-draft a rejected letter' },
    ],
  },
  LEARNING: {
    capability: 'learning.unlock',
    auditAction: 'LEARNING_LOCKOUT_REVERSED',
    auditEntityType: 'LEARNING',
    noun: 'test lockout',
    transitions: [{ from: 'LOCKED', to: 'UNLOCKED', label: 'Reset attempts and unlock the test' }],
  },
}

// ============================================================
// Reading and writing state per entity
// ============================================================

type CurrentState = { state: string; subjectUserId: string | null; describe: string }

async function loadState(
  entityType: ReversibleEntityType,
  entityId: string,
): Promise<CurrentState | null> {
  switch (entityType) {
    case 'LEAVE': {
      const r = await db.leaveRequest.findUnique({
        where: { id: entityId },
        include: { leaveType: { select: { name: true } } },
      })
      return r ? { state: r.status, subjectUserId: r.userId, describe: r.leaveType.name } : null
    }
    case 'EXPENSE': {
      const e = await db.expense.findUnique({ where: { id: entityId } })
      return e
        ? {
            state: e.status,
            subjectUserId: e.userId,
            describe: `${e.currency} ${Number(e.amount).toFixed(2)} — ${e.merchant}`,
          }
        : null
    }
    case 'TIME_ENTRY': {
      const t = await db.timeEntry.findUnique({ where: { id: entityId } })
      return t
        ? {
            state: t.status,
            subjectUserId: t.userId,
            describe: new Date(t.workDate).toISOString().slice(0, 10),
          }
        : null
    }
    case 'REVIEW_CYCLE': {
      const c = await db.reviewCycle.findUnique({ where: { id: entityId } })
      return c ? { state: c.status, subjectUserId: null, describe: c.name } : null
    }
    case 'PERFORMANCE_REVIEW': {
      const r = await db.performanceReview.findUnique({
        where: { id: entityId },
        include: { cycle: { select: { name: true } } },
      })
      return r ? { state: r.status, subjectUserId: r.employeeId, describe: r.cycle.name } : null
    }
    case 'REWARD_CYCLE': {
      const c = await db.rewardCycle.findUnique({ where: { id: entityId } })
      return c ? { state: c.status, subjectUserId: null, describe: c.name } : null
    }
    case 'REWARD_ALLOCATION': {
      const a = await db.rewardAllocation.findUnique({ where: { id: entityId } })
      return a
        ? {
            state: a.status,
            subjectUserId: a.employeeId,
            describe: `${a.currency} ${Number(a.amount).toFixed(2)}`,
          }
        : null
    }
    case 'EMPLOYMENT_LETTER': {
      const l = await db.employmentLetter.findUnique({ where: { id: entityId } })
      return l ? { state: l.status, subjectUserId: l.employeeId, describe: l.type } : null
    }
    case 'LEARNING': {
      const [userId, testId] = entityId.split(':')
      if (!userId || !testId) return null
      const p = await db.learningTestProgress.findUnique({
        where: { userId_testId: { userId, testId } },
      })
      if (!p) return null
      return { state: p.locked ? 'LOCKED' : 'UNLOCKED', subjectUserId: userId, describe: testId }
    }
  }
}

/**
 * Apply the state change, plus whatever bookkeeping that state change implies
 * (leave balances, cleared payment stamps, reset attempt counters).
 */
async function applyReversal(
  entityType: ReversibleEntityType,
  entityId: string,
  from: string,
  to: string,
): Promise<void> {
  switch (entityType) {
    case 'LEAVE': {
      const request = await db.leaveRequest.findUniqueOrThrow({
        where: { id: entityId },
        include: { leaveType: true },
      })
      const isUnlimited = request.leaveType.defaultEntitlement === 0

      // Back to PENDING means the days are held as pending again. Cancelling
      // an approved request had decremented `used`; rejecting had decremented
      // `pending`. Either way the restored request holds `pending` days.
      const restoreRequest = db.leaveRequest.update({
        where: { id: entityId },
        data: {
          status: 'PENDING',
          cancelledAt: null,
          approvedAt: null,
          rejectionReason: null,
        },
      })

      if (isUnlimited) {
        await restoreRequest
      } else {
        await db.$transaction([
          restoreRequest,
          db.leaveBalance.updateMany({
            where: {
              userId: request.userId,
              leaveTypeId: request.leaveTypeId,
              year: request.startDate.getFullYear(),
            },
            data: { pending: { increment: request.daysCount } },
          }),
        ])
      }
      return
    }

    case 'EXPENSE': {
      if (to === 'DRAFT') {
        // Returned for correction: the employee can edit and resubmit, which
        // was impossible before — only DRAFTs are editable and REJECTED was
        // terminal.
        await db.expense.update({
          where: { id: entityId },
          data: { status: 'DRAFT', approverId: null, submittedAt: null },
        })
        return
      }
      // REIMBURSED → APPROVED: the payment didn't land.
      await db.expense.update({
        where: { id: entityId },
        data: { status: 'APPROVED', reimbursedAt: null, reimbursedById: null },
      })
      return
    }

    case 'TIME_ENTRY': {
      await db.timeEntry.update({
        where: { id: entityId },
        data:
          to === 'DRAFT'
            ? { status: 'DRAFT', approvedAt: null, submittedAt: null }
            : { status: 'SUBMITTED', rejectionReason: null },
      })
      return
    }

    case 'REVIEW_CYCLE': {
      await db.reviewCycle.update({ where: { id: entityId }, data: { status: 'EVALUATION' } })
      return
    }

    case 'PERFORMANCE_REVIEW': {
      await db.performanceReview.update({
        where: { id: entityId },
        data: {
          status: 'IN_EVALUATION',
          acknowledgedAt: null,
          submittedForEvaluationAt: null,
        },
      })
      return
    }

    case 'REWARD_CYCLE': {
      if (to === 'DRAFT') {
        // Roll the allocations back with the cycle, otherwise the cycle is
        // editable while its lines are frozen APPROVED.
        await db.$transaction([
          db.rewardCycle.update({ where: { id: entityId }, data: { status: 'DRAFT' } }),
          db.rewardAllocation.updateMany({
            where: { cycleId: entityId, status: 'APPROVED' },
            data: { status: 'DRAFT', approverId: null, approvedAt: null },
          }),
        ])
        return
      }
      await db.rewardCycle.update({ where: { id: entityId }, data: { status: 'APPROVED' } })
      return
    }

    case 'REWARD_ALLOCATION': {
      await db.rewardAllocation.update({
        where: { id: entityId },
        data: { status: 'DRAFT', approverId: null, approvedAt: null, paidAt: null },
      })
      return
    }

    case 'EMPLOYMENT_LETTER': {
      await db.employmentLetter.update({
        where: { id: entityId },
        data: { status: 'PENDING_REVIEW', rejectedById: null, rejectionReason: null },
      })
      return
    }

    case 'LEARNING': {
      const [userId, testId] = entityId.split(':')
      // Attempts reset to zero as well as unlocking — otherwise the learner is
      // unlocked with no attempts left and locks again on the next failure.
      await db.learningTestProgress.update({
        where: { userId_testId: { userId, testId } },
        data: { locked: false, attempts: 0 },
      })
      return
    }
  }
}

// ============================================================
// The operation
// ============================================================

export async function reverseState(input: ReversalInput): Promise<ReversalResult> {
  const spec = SPECS[input.entityType]

  if (!can(input.actorRole, spec.capability)) {
    return { success: false, error: `You do not have permission to reverse this ${spec.noun}.` }
  }

  const reason = input.reason?.trim() ?? ''
  if (reason.length < MIN_REASON_LENGTH) {
    return {
      success: false,
      error: `Give a reason of at least ${MIN_REASON_LENGTH} characters. It is recorded permanently against this ${spec.noun}.`,
    }
  }

  const current = await loadState(input.entityType, input.entityId)
  if (!current) {
    return { success: false, error: `That ${spec.noun} no longer exists.` }
  }

  const rule = spec.transitions.find(t => t.from === current.state && t.to === input.to)
  if (!rule) {
    const options = spec.transitions.filter(t => t.from === current.state)
    return {
      success: false,
      error: options.length
        ? `A ${spec.noun} in state ${current.state} can only be moved to ${options.map(o => o.to).join(' or ')}.`
        : `A ${spec.noun} in state ${current.state} cannot be reversed.`,
    }
  }

  await applyReversal(input.entityType, input.entityId, current.state, input.to)

  await createAuditLog({
    userId: input.actorId,
    action: spec.auditAction,
    entityType: spec.auditEntityType,
    entityId: input.entityId,
    details: {
      reversal: true,
      from: current.state,
      to: input.to,
      reason,
      subjectUserId: current.subjectUserId,
    },
  })

  // Tell the person whose record it is. A record changing state underneath
  // someone without explanation is worse than the dead end it replaced.
  if (current.subjectUserId && current.subjectUserId !== input.actorId) {
    await notify({
      userId: current.subjectUserId,
      type: 'STATE_REVERSED',
      title: `Your ${spec.noun} was reopened`,
      body: `${current.describe}: moved from ${current.state} to ${input.to}. Reason: "${reason}"`,
    })
  }

  return { success: true, from: current.state, to: input.to }
}
