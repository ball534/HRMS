// ============================================================
// Expense helpers — server-only (imports db)
// ============================================================
// This file imports from @/lib/db and must NOT be imported in client components.
// For pure constants safe in client components, use @/lib/expense-constants instead.

import { db } from '@/lib/db'
import { resolveApprover } from '@/lib/approvers'

// Re-export pure constants for server-side convenience
// Client components must import from '@/lib/expense-constants' directly.
export {
  EXPENSE_CATEGORIES,
  formatCurrency,
} from '@/lib/expense-constants'

// ============================================================
// getExpenseApprover
// ============================================================
/**
 * Resolves the approver for a given submitter.
 *
 * This used to hardcode two named individuals at an external domain — every
 * claim in the company routed to `jin@tictag.io`, falling back to
 * `kevin@tictag.io`. `reportingManagerId` was ignored entirely, there was no
 * delegation or backup, and because both lookups used `findUniqueOrThrow`, a
 * missing or renamed user row meant *nobody in the company could submit an
 * expense at all*.
 *
 * Now:
 *   1. If `EXPENSE_APPROVER_EMAIL` names an active user who isn't the
 *      submitter, they get it — this preserves a deliberate "all expenses go
 *      to finance" arrangement where one is configured.
 *   2. Otherwise fall back to the standard chain in src/lib/approvers.ts:
 *      reporting manager → configured fallback approver → any other ADMIN →
 *      any other HR user. Never the submitter themselves.
 */
export async function getExpenseApprover(submitterId: string): Promise<string> {
  const financeApproverEmail = process.env.EXPENSE_APPROVER_EMAIL

  if (financeApproverEmail) {
    const financeApprover = await db.user.findUnique({
      where: { email: financeApproverEmail },
      select: { id: true, status: true },
    })
    if (financeApprover && financeApprover.status === 'ACTIVE' && financeApprover.id !== submitterId) {
      return financeApprover.id
    }
    // Configured approver is gone, inactive, or is the submitter — fall through
    // rather than throwing and blocking submission.
  }

  const { approverId } = await resolveApprover(submitterId)
  return approverId
}
