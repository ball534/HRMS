/**
 * Capability-based authorization.
 *
 * Before this file, every screen and action asked the same question its own
 * way — `requireRole(['ADMIN'])` here, `session.role !== 'ADMIN'` there — and
 * the answer was almost always "ADMIN only". That locked the HR team out of
 * most of the work HR actually does (hiring, work passes, letters, holidays,
 * performance and reward cycles), whose only practical workaround is sharing
 * the ADMIN login — which destroys per-user accountability in the audit log.
 *
 * The fix is to name the *capability* a screen needs rather than the role that
 * happens to have it, and to keep the role -> capability mapping in one table
 * you can read top to bottom.
 *
 * The rules encoded below:
 *
 *   ADMIN    every capability, without exception. ADMIN is the superset of
 *            HR and always retains access HR does not have.
 *   HR       everything operational: people, identity records, leave admin,
 *            holidays, blackouts, work passes, letters, performance and
 *            reward cycles, learning admin, documents, audit, statutory
 *            rules. Deliberately NOT: hard deletes, role/status changes,
 *            payroll export, or paying money out (expense reimbursement and
 *            bonus payout).
 *   MANAGER  approving what their own reports submit, nothing administrative.
 *   EMPLOYEE
 *   CONTRACTOR
 *            self-service only; they hold no capability from this table.
 *
 * Usage — server actions and pages:
 *
 *   const session = await requireCapability('people.write')   // from dal.ts
 *
 * Usage — conditional UI (role string is already on the session):
 *
 *   {can(role, 'people.write') && <AddEmployeeButton />}
 *
 * Adding a capability: add it to CAPABILITIES, grant it in ROLE_CAPABILITIES,
 * then use it. TypeScript will reject a typo'd capability string at the call
 * site, which the old inline role checks could never do.
 */

// ============================================================
// The capability vocabulary
// ============================================================

export const CAPABILITIES = [
  // --- People & org ---
  'people.read.directory', // list colleagues (name, position, department)
  'people.read.identity', // NRIC / passport / DOB / nationality
  'people.write', // create + edit employee records
  'people.write.role', // change someone's role or status  [ADMIN only]
  'people.offboard', // run the offboarding flow
  'people.delete', // hard delete a record               [ADMIN only]
  'people.reset_password', // force a password reset for someone else

  // --- Leave ---
  'leave.approve', // action a request routed to you
  'leave.admin', // balances, entitlement overrides, carry-forward
  'leave.admin.import', // bulk CSV import
  'leave.delete', // hard delete a leave record         [ADMIN only]
  'holidays.write',
  'blackouts.write',

  // --- Time & payroll ---
  'time.approve',
  'time.admin', // unlock/correct approved entries
  'payroll.read',
  'payroll.export', // pay figures + emails leave the app  [ADMIN only]

  // --- Expenses ---
  'expense.approve',
  'expense.admin', // override an approval, edit in flight
  'expense.reimburse', // release money                       [ADMIN only]
  'expense.export',
  'expense.delete', // [ADMIN only]

  // --- Performance ---
  'performance.admin', // create/open/close cycles, scoping
  'performance.calibrate', // moderate ratings before release
  'performance.export',

  // --- Rewards ---
  'rewards.admin', // cycles + allocations
  'rewards.pay', // mark bonuses paid                   [ADMIN only]
  'rewards.export',

  // --- Learning ---
  'learning.admin', // materials, module lessons, progress
  'learning.unlock', // reset a learner's test lockout

  // --- Work passes, letters, documents ---
  'workpass.read',
  'workpass.write',
  'letters.read',
  'letters.write',
  'documents.admin', // browse/upload against any employee

  // --- Governance ---
  'audit.read',
  'settings.write', // org-wide operational settings        [ADMIN only]
  'statutory.write', // maintain the country rulebook
  'statutory.verify', // record adviser sign-off             [ADMIN only]
  'reversal.perform', // reverse a terminal state (with reason)
] as const

export type Capability = (typeof CAPABILITIES)[number]

// ============================================================
// Role -> capability mapping
// ============================================================

/** Sentinel for "every capability, including ones added later". */
const ALL = '*' as const

/**
 * What HR can do. This is the whole capability list minus the four
 * categories HR is deliberately excluded from:
 *
 *   destructive  people.delete, leave.delete, expense.delete
 *   auth         people.write.role
 *   money out    expense.reimburse, rewards.pay
 *   pay data     payroll.export
 *
 * HR keeps `payroll.read` — they need to see the figures to answer
 * questions — but exporting them is an ADMIN act.
 */
const HR_CAPABILITIES: Capability[] = [
  'people.read.directory',
  'people.read.identity',
  'people.write',
  'people.offboard',
  'people.reset_password',

  'leave.approve',
  'leave.admin',
  'leave.admin.import',
  'holidays.write',
  'blackouts.write',

  'time.approve',
  'time.admin',
  'payroll.read',

  'expense.approve',
  'expense.admin',
  'expense.export',

  'performance.admin',
  'performance.calibrate',
  'performance.export',

  'rewards.admin',
  'rewards.export',

  'learning.admin',
  'learning.unlock',

  'workpass.read',
  'workpass.write',
  'letters.read',
  'letters.write',
  'documents.admin',

  'audit.read',
  'statutory.write',
  'reversal.perform',
]

/** Managers approve their own team's submissions and nothing else. */
const MANAGER_CAPABILITIES: Capability[] = [
  'people.read.directory',
  'leave.approve',
  'time.approve',
  'expense.approve',
]

const ROLE_CAPABILITIES: Record<string, readonly Capability[] | readonly [typeof ALL]> = {
  ADMIN: [ALL],
  HR: HR_CAPABILITIES,
  MANAGER: MANAGER_CAPABILITIES,
  EMPLOYEE: ['people.read.directory'],
  CONTRACTOR: [],
}

// ============================================================
// Checks
// ============================================================

/** Does `role` hold `capability`? Unknown roles hold nothing. */
export function can(role: string | null | undefined, capability: Capability): boolean {
  if (!role) return false
  const granted = ROLE_CAPABILITIES[role]
  if (!granted) return false
  if (granted[0] === ALL) return true
  return (granted as readonly Capability[]).includes(capability)
}

