// ============================================================
// Expense helpers — server-only (imports db)
// ============================================================
// This file imports from @/lib/db and must NOT be imported in client components.
// For pure constants safe in client components, use @/lib/expense-constants instead.

import { db } from '@/lib/db'

// Re-export pure constants for server-side convenience
// Client components must import from '@/lib/expense-constants' directly.
export {
  CURRENCIES,
  CURRENCY_CODES,
  EXPENSE_CATEGORIES,
  formatCurrency,
  type CurrencyCode,
} from '@/lib/expense-constants'

// ============================================================
// getExpenseApprover
// ============================================================
// Resolves the approver for a given submitter.
// Business rule: everyone routes to Jin Lee; Jin Lee routes to Kevin Quah.

export async function getExpenseApprover(submitterId: string): Promise<string> {
  const JIN_LEE_EMAIL = process.env.EXPENSE_APPROVER_EMAIL || 'jin@tictag.io'
  const KEVIN_QUAH_EMAIL = process.env.EXPENSE_FALLBACK_APPROVER_EMAIL || 'kevin@tictag.io'

  const submitter = await db.user.findUniqueOrThrow({
    where: { id: submitterId },
    select: { email: true },
  })

  if (submitter.email === JIN_LEE_EMAIL) {
    // Jin Lee's expenses route to Kevin Quah
    const kevin = await db.user.findUniqueOrThrow({
      where: { email: KEVIN_QUAH_EMAIL },
      select: { id: true },
    })
    return kevin.id
  }

  // Everyone else routes to Jin Lee
  const jin = await db.user.findUniqueOrThrow({
    where: { email: JIN_LEE_EMAIL },
    select: { id: true },
  })
  return jin.id
}
