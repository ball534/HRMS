'use server'

import { db } from '@/lib/db'
import { requireRole } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import {
  calculateAnnualEntitlement,
  calculateProRataEntitlement,
  applyCarryForwardExpiry,
  computeAvailable,
  carryForwardExpiryFor,
} from '@/lib/leaveEntitlement'

const HR_ROLES = ['ADMIN', 'HR']

// ============================================================
// Helpers
// ============================================================

/**
 * Apply carry-forward expiry if needed and return the up-to-date row.
 * Cheap no-op if there's nothing to expire.
 */
async function ensureCarryForwardExpiryApplied(balanceId: string) {
  const b = await db.leaveBalance.findUnique({ where: { id: balanceId } })
  if (!b) return null
  const next = applyCarryForwardExpiry(b)
  if (!next) return b
  return db.leaveBalance.update({
    where: { id: balanceId },
    data: next,
  })
}

// ============================================================
// getOrCreateBalance
// ============================================================

/**
 * Gets or creates a LeaveBalance row for a given user/leaveType/year.
 * Lazy initialization — created on first access.
 *
 * If the row already exists AND its carry-forward has expired since the
 * last access, the expiry is applied transparently.
 */
export async function getOrCreateBalance(
  userId: string,
  leaveTypeId: string,
  year: number
) {
  const [user, leaveType] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { employmentType: true, startDate: true, country: true, gender: true },
    }),
    db.leaveType.findUniqueOrThrow({
      where: { id: leaveTypeId },
      select: { name: true, defaultEntitlement: true },
    }),
  ])

  let entitlement: number

  if (leaveType.name === 'Annual Leave') {
    const startDate = user.startDate ?? new Date(year, 0, 1)
    const full = calculateAnnualEntitlement(user.employmentType, startDate, year)
    entitlement = calculateProRataEntitlement(full, startDate, year)
  } else if (leaveType.name === 'Maternity Leave') {
    if (user.gender === 'Male') {
      entitlement = 0
    } else {
      const maternityByCountry: Record<string, number> = { SG: 112, MY: 98 }
      entitlement = maternityByCountry[user.country] ?? 98
    }
  } else if (leaveType.name === 'Paternity Leave') {
    if (user.gender === 'Female') {
      entitlement = 0
    } else {
      const paternityByCountry: Record<string, number> = { SG: 14, MY: 7 }
      entitlement = paternityByCountry[user.country] ?? 0
    }
  } else if (leaveType.defaultEntitlement > 0) {
    entitlement = leaveType.defaultEntitlement
  } else {
    entitlement = 0
  }

  const upserted = await db.leaveBalance.upsert({
    where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
    create: { userId, leaveTypeId, year, entitlement, carryForward: 0 },
    update: {}, // don't overwrite existing entitlement (preserves HR overrides)
  })

  // Apply any pending carry-forward expiry transparently
  const refreshed = await ensureCarryForwardExpiryApplied(upserted.id)
  return refreshed ?? upserted
}

async function initAllBalances(userId: string, year: number) {
  const leaveTypes = await db.leaveType.findMany({ select: { id: true } })
  const balances = await Promise.all(
    leaveTypes.map(lt => getOrCreateBalance(userId, lt.id, year))
  )
  return balances
}

/**
 * Returns all leave balances for a user + year with a computed `available`.
 * Applies carry-forward expiry inline.
 */
export async function getLeaveBalances(userId: string, year: number) {
  await initAllBalances(userId, year)

  const balances = await db.leaveBalance.findMany({
    where: { userId, year },
    include: { leaveType: true },
    orderBy: { leaveType: { name: 'asc' } },
  })

  return balances.map(b => ({
    ...b,
    available: computeAvailable(b),
  }))
}

// ============================================================
// adjustBalance — manual +/- delta on the `adjustment` field
// ============================================================

export type AdjustBalanceState = {
  success?: boolean
  error?: string
}

export async function adjustBalance(
  _state: AdjustBalanceState,
  formData: FormData
): Promise<AdjustBalanceState> {
  const session = await requireRole(HR_ROLES)

  const userId = formData.get('userId') as string
  const leaveTypeId = formData.get('leaveTypeId') as string
  const yearStr = formData.get('year') as string
  const deltaStr = formData.get('adjustmentDelta') as string
  const reason = (formData.get('reason') as string) ?? ''

  if (!userId || !leaveTypeId || !yearStr || !deltaStr) {
    return { error: 'Missing required fields' }
  }

  const year = parseInt(yearStr)
  const delta = parseFloat(deltaStr)

  if (isNaN(year) || isNaN(delta)) {
    return { error: 'Invalid year or adjustment value' }
  }

  try {
    await db.leaveBalance.update({
      where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
      data: { adjustment: { increment: delta } },
    })

    await createAuditLog({
      userId: session.userId,
      action: 'BALANCE_ADJUSTED',
      entityType: 'LEAVE',
      details: { targetUserId: userId, leaveTypeId, year, delta, reason, action: 'adjustment-delta' },
    })

    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to adjust balance' }
  }
}

// ============================================================
// setEntitlementOverride — HR sets the base entitlement directly
// (used while the per-grade table is still TBD; HR can give us a
//  current count per employee and we honor it)
// ============================================================

export type SetEntitlementState = {
  success?: boolean
  error?: string
}

export async function setEntitlementOverride(
  _state: SetEntitlementState,
  formData: FormData
): Promise<SetEntitlementState> {
  const session = await requireRole(HR_ROLES)

  const userId = formData.get('userId') as string
  const leaveTypeId = formData.get('leaveTypeId') as string
  const yearStr = formData.get('year') as string
  const valueStr = formData.get('entitlementOverride') as string // empty string = clear
  const reason = (formData.get('reason') as string) ?? ''

  if (!userId || !leaveTypeId || !yearStr) {
    return { error: 'Missing required fields' }
  }
  const year = parseInt(yearStr)
  if (isNaN(year)) return { error: 'Invalid year' }

  let override: number | null
  if (valueStr === '' || valueStr === null || valueStr === undefined) {
    override = null
  } else {
    const n = parseFloat(valueStr)
    if (isNaN(n) || n < 0) return { error: 'Override must be a non-negative number' }
    override = n
  }

  try {
    // Ensure row exists, then update override
    await getOrCreateBalance(userId, leaveTypeId, year)
    await db.leaveBalance.update({
      where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
      data: { entitlementOverride: override },
    })

    await createAuditLog({
      userId: session.userId,
      action: 'BALANCE_ADJUSTED',
      entityType: 'LEAVE',
      details: {
        targetUserId: userId,
        leaveTypeId,
        year,
        entitlementOverride: override,
        reason,
        action: override === null ? 'clear-entitlement-override' : 'set-entitlement-override',
      },
    })

    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to set entitlement override' }
  }
}

// ============================================================
// runCarryForward — year-end batch
// ============================================================

export type CarryForwardState = {
  success?: boolean
  processed?: number
  error?: string
}

/**
 * HR action to run year-end carry-forward for Annual Leave.
 * formData contains `year` (the NEW year to carry balances INTO).
 *
 * Rules (per HR team, 2026-06):
 * - available = entitlement + carryForward + adjustment - used (pending excluded)
 * - ALL unused days carry forward (no cap)
 * - Carryover expires March 31 of the new year
 */
export async function runCarryForward(
  _state: CarryForwardState,
  formData: FormData
): Promise<CarryForwardState> {
  const session = await requireRole(HR_ROLES)

  const yearStr = formData.get('year') as string
  if (!yearStr) return { error: 'year is required' }
  const year = parseInt(yearStr)
  if (isNaN(year)) return { error: 'Invalid year' }

  const prevYear = year - 1

  try {
    const annualLeave = await db.leaveType.findUnique({ where: { name: 'Annual Leave' } })
    if (!annualLeave) return { error: 'Annual Leave type not found' }

    const prevBalances = await db.leaveBalance.findMany({
      where: { leaveTypeId: annualLeave.id, year: prevYear },
      include: { user: { select: { employmentType: true, startDate: true } } },
    })

    const expiresAt = carryForwardExpiryFor(year)
    let processed = 0

    for (const prev of prevBalances) {
      // Carry the full unused portion — no cap.
      const prevEntitlement = prev.entitlementOverride ?? prev.entitlement
      const available = prevEntitlement + prev.carryForward + prev.adjustment - prev.used
      const carryForwardDays = Math.max(available, 0)

      const startDate = prev.user.startDate ?? new Date(year, 0, 1)
      const fullEntitlement = calculateAnnualEntitlement(
        prev.user.employmentType,
        startDate,
        year
      )
      const newEntitlement = calculateProRataEntitlement(fullEntitlement, startDate, year)

      await db.leaveBalance.upsert({
        where: {
          userId_leaveTypeId_year: {
            userId: prev.userId,
            leaveTypeId: prev.leaveTypeId,
            year,
          },
        },
        create: {
          userId: prev.userId,
          leaveTypeId: prev.leaveTypeId,
          year,
          entitlement: newEntitlement,
          carryForward: carryForwardDays,
          carryForwardExpiresAt: carryForwardDays > 0 ? expiresAt : null,
        },
        update: {
          carryForward: carryForwardDays,
          carryForwardExpiresAt: carryForwardDays > 0 ? expiresAt : null,
          entitlement: newEntitlement,
        },
      })

      await createAuditLog({
        userId: session.userId,
        action: 'BALANCE_ADJUSTED',
        entityType: 'LEAVE',
        details: {
          targetUserId: prev.userId,
          leaveTypeId: prev.leaveTypeId,
          year,
          carryForwardDays,
          carryForwardExpiresAt: expiresAt.toISOString(),
          prevAvailable: available,
          action: 'carry-forward',
        },
      })

      processed++
    }

    return { success: true, processed }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Carry-forward failed' }
  }
}
