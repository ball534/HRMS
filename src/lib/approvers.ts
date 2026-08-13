import 'server-only'

import { db } from '@/lib/db'
import { getSetting } from '@/lib/settings'

/**
 * Who approves what, and who is not allowed to approve their own work.
 *
 * Two problems this module fixes.
 *
 * **Self-approval was possible everywhere.** An ADMIN or HR user could approve
 * their own leave, approve *and* reimburse their own expense claim, approve
 * their own timesheet, propose and approve their own bonus, and — where an
 * employee had no reporting manager — become their own performance reviewer.
 * No module had a "not your own record" guard.
 *
 * **Employees with no manager were stuck.** Leave submission hard-failed with
 * "contact your administrator", and timesheet submission set `approverId: null`
 * so the week landed in nobody's queue and never reached payroll. There was no
 * fallback approver anywhere.
 *
 * `resolveApprover` gives every employee a real approver who is never
 * themselves; `assertNotSelf` refuses the action if one slips through anyway.
 */

/** Raised when someone tries to action their own record. */
export class SelfApprovalError extends Error {
  constructor(message = 'You cannot approve your own request') {
    super(message)
    this.name = 'SelfApprovalError'
  }
}

/** Raised when nobody in the organisation can approve for this employee. */
export class NoApproverError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoApproverError'
  }
}

/**
 * Refuse an action where the actor is the subject.
 *
 * Honours the `approvals.blockSelfApproval` setting so a one-person
 * organisation can be unblocked deliberately, from a screen, with the change
 * recorded in the audit log — rather than the rule simply not existing.
 */
export async function assertNotSelf(
  actorId: string,
  subjectId: string,
  what = 'request',
): Promise<void> {
  if (actorId !== subjectId) return

  const blocked = await getSetting('approvals.blockSelfApproval')
  if (!blocked) return

  throw new SelfApprovalError(
    `You cannot approve your own ${what}. It needs to be actioned by someone else.`,
  )
}

/** Non-throwing form, for deciding whether to render an approve button. */
export async function isSelfApproval(actorId: string, subjectId: string): Promise<boolean> {
  if (actorId !== subjectId) return false
  return getSetting('approvals.blockSelfApproval')
}

export type ApproverResolution = {
  approverId: string
  /** Where the approver came from — surfaced in the UI so routing isn't a mystery. */
  source: 'manager' | 'fallback_setting' | 'admin' | 'hr'
}

/**
 * Find who should approve for `employeeId`, never returning the employee
 * themselves.
 *
 * Order:
 *   1. their reporting manager (if active, and not themselves)
 *   2. the configured fallback approver (Settings → Approvals)
 *   3. any other active ADMIN
 *   4. any other active HR user
 *
 * Throws `NoApproverError` only when the organisation genuinely has nobody
 * else who could act — which in practice means a single-user database.
 */
export async function resolveApprover(employeeId: string): Promise<ApproverResolution> {
  const employee = await db.user.findUnique({
    where: { id: employeeId },
    select: { id: true, reportingManagerId: true, firstName: true, lastName: true },
  })

  if (!employee) throw new NoApproverError('Employee not found')

  // 1. Reporting manager.
  if (employee.reportingManagerId && employee.reportingManagerId !== employee.id) {
    const manager = await db.user.findUnique({
      where: { id: employee.reportingManagerId },
      select: { id: true, status: true },
    })
    if (manager && manager.status === 'ACTIVE') {
      return { approverId: manager.id, source: 'manager' }
    }
  }

  // 2. Configured fallback approver.
  const fallbackId = await getSetting('leave.fallbackApproverId')
  if (fallbackId && fallbackId !== employee.id) {
    const fallback = await db.user.findUnique({
      where: { id: fallbackId },
      select: { id: true, status: true },
    })
    if (fallback && fallback.status === 'ACTIVE') {
      return { approverId: fallback.id, source: 'fallback_setting' }
    }
  }

  // 3. Any other active ADMIN, then 4. any other active HR user.
  for (const [role, source] of [
    ['ADMIN', 'admin'],
    ['HR', 'hr'],
  ] as const) {
    const candidate = await db.user.findFirst({
      where: { role, status: 'ACTIVE', id: { not: employee.id } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    if (candidate) return { approverId: candidate.id, source }
  }

  throw new NoApproverError(
    `No one is available to approve for ${employee.firstName} ${employee.lastName}. ` +
      `Set a fallback approver in Settings → Approvals.`,
  )
}

/**
 * Same resolution, but returns null instead of throwing — for callers that
 * want to degrade rather than fail (e.g. assigning a performance reviewer
 * during bulk cycle scoping, where one unresolvable employee shouldn't abort
 * the whole batch).
 */
export async function tryResolveApprover(employeeId: string): Promise<ApproverResolution | null> {
  try {
    return await resolveApprover(employeeId)
  } catch {
    return null
  }
}
