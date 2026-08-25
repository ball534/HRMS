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
 * There are four account types, and they exist to match how the business
 * describes its own people rather than to model a permission hierarchy:
 *
 *   HR        full access. There is no separate administrator account any
 *             more: ADMIN sat above HR, so the HR team either lacked powers
 *             they needed daily or borrowed the admin login. HR holds every
 *             capability, including the destructive and money-out ones.
 *   MANAGER   their own team and their own department. They approve what
 *             their reports submit, read (but never edit) the people in their
 *             department, and follow their team's learning progress. Nothing
 *             administrative, no identity records, no pay.
 *   EMPLOYEE  self-service only. Holds no capability from this table.
 *   PARTTIME  self-service plus the timesheet. Also holds no capability —
 *             timesheet access is about employment arrangement, not authority,
 *             and is decided by the role/employment type directly.
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
  'people.read.directory', // list everyone in the company
  'people.read.department', // list only your own department, read-only  [MANAGER]
  'people.read.identity', // NRIC / passport / DOB / nationality
  'people.write', // create + edit employee records
  'people.write.role', // change someone's role or status
  'people.offboard', // run the offboarding flow
  'people.delete', // hard delete a record
  'people.reset_password', // force a password reset for someone else

  // --- Hiring ---
  'candidates.read', // see applications
  'candidates.write', // shortlist, record the interview outcome, archive

  // --- Leave ---
  'leave.approve', // action a request routed to you
  'leave.admin', // balances, entitlement overrides, carry-forward
  'leave.admin.import', // bulk CSV import
  'leave.delete', // hard delete a leave record
  'holidays.write',
  'blackouts.write',

  // --- Time & payroll ---
  'time.approve',
  'time.admin', // unlock/correct approved entries
  'payroll.read',
  'payroll.export', // pay figures + emails leave the app

  // The expenses module was removed. Its capabilities went with it — if claims
  // ever come back, they come back with their own vocabulary rather than
  // inheriting a set of names nothing has checked in the meantime.

  // --- Performance ---
  'performance.admin', // create/open/close cycles, scoping
  'performance.calibrate', // moderate ratings before release
  'performance.export',

  // --- Rewards ---
  'rewards.admin', // cycles + allocations
  'rewards.pay', // mark bonuses paid
  'rewards.export',

  // --- Learning ---
  'learning.admin', // materials, module lessons, progress
  'learning.progress.read', // follow how learners are doing, without editing content
  'learning.unlock', // reset a learner's test lockout

  // --- Work passes, letters, documents ---
  'workpass.read',
  'workpass.write',
  'letters.read',
  'letters.write',
  'documents.admin', // browse/upload against any employee

  // --- Governance ---
  'audit.read',
  'settings.write', // org-wide operational settings
  'statutory.write', // maintain the country rulebook
  'statutory.verify', // record adviser sign-off
  'reversal.perform', // reverse a terminal state (with reason)
] as const

export type Capability = (typeof CAPABILITIES)[number]

// ============================================================
// Role -> capability mapping
// ============================================================

/** Sentinel for "every capability, including ones added later". */
const ALL = '*' as const

/**
 * What a manager can do: act on their own team, and look at their own
 * department.
 *
 * `people.read.department` is deliberately not `people.read.directory` — a
 * manager sees the people they work with, not the whole company, and never the
 * identity fields (NRIC, passport, date of birth) that HR needs for statutory
 * filings. There is no `people.write` here either: a transfer or a title change
 * is an HR record change even when the manager is the one who decided it.
 */
const MANAGER_CAPABILITIES: Capability[] = [
  'people.read.department',
  'leave.approve',
  'time.approve',
  'learning.progress.read',
  // Managers are the interviewers, so they read and act on applications for
  // their own department — see the scoping in src/actions/candidates.ts. They
  // cannot complete a hire, because that creates an account (`people.write`).
  'candidates.read',
  'candidates.write',
]

const ROLE_CAPABILITIES: Record<string, readonly Capability[] | readonly [typeof ALL]> = {
  HR: [ALL],
  MANAGER: MANAGER_CAPABILITIES,
  EMPLOYEE: [],
  PARTTIME: [],
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

// ============================================================
// Roles
// ============================================================

export const ROLES = ['HR', 'MANAGER', 'EMPLOYEE', 'PARTTIME'] as const
export type RoleName = (typeof ROLES)[number]

/** Labels for the role picker on the employee forms. */
export const ROLE_LABELS: Record<RoleName, string> = {
  HR: 'HR (full access)',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
  PARTTIME: 'Part-time',
}

/**
 * Part-timers are identified by their role, and `employmentType` follows it.
 * Keeping one source of truth means timesheet access and pay treatment cannot
 * drift apart — which they could when a PART_TIME employment type and an
 * EMPLOYEE role were set independently.
 */
export function isPartTimeRole(role: string | null | undefined): boolean {
  return role === 'PARTTIME'
}
