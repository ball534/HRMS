'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { verifySession, requireRole } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import { computePayroll, monthBounds, weekBounds } from '@/lib/payroll'

// ============================================================
// Types & schemas
// ============================================================

export type TimeEntryActionState = {
  success?: boolean
  error?: string
  errors?: Record<string, string[]>
}

const RETROACTIVE_DAYS = 14

const saveEntrySchema = z.object({
  entryId: z.string().uuid().optional(),
  workDate: z.string().min(1, 'Date is required'),
  hoursWorked: z.coerce.number().min(0.25, 'At least 0.25 hour').max(24, 'At most 24 hours'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  breakMinutes: z.coerce.number().int().min(0).max(720).default(0),
  description: z.string().optional(),
})

const rejectSchema = z.object({
  entryId: z.string().uuid(),
  reason: z.string().min(1, 'A reason is required when rejecting.'),
})

// ============================================================
// Helpers
// ============================================================

function toDateOnly(s: string): Date {
  // Force UTC midnight so it lines up with the DATE column comparisons.
  return new Date(`${s}T00:00:00.000Z`)
}

function isoToTime(workDate: string, time: string | undefined): Date | null {
  if (!time) return null
  return new Date(`${workDate}T${time}:00.000Z`)
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

// ============================================================
// saveTimeEntry — employee creates/edits a DRAFT entry
// ============================================================

export async function saveTimeEntry(
  _state: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  try {
    const session = await verifySession()

    const parsed = saveEntrySchema.safeParse(Object.fromEntries(formData.entries()))
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }
    const data = parsed.data
    const workDate = toDateOnly(data.workDate)

    // Retroactive cap
    if (workDate < daysAgo(RETROACTIVE_DAYS)) {
      return { error: `Cannot enter time more than ${RETROACTIVE_DAYS} days in the past.` }
    }
    // No future dates beyond today
    const today = new Date()
    today.setUTCHours(23, 59, 59, 999)
    if (workDate > today) {
      return { error: 'Cannot enter time for future dates.' }
    }

    // Auto-detect public holiday for the user's country
    const user = await db.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: { country: true, employmentType: true },
    })
    if (user.employmentType !== 'PART_TIME') {
      return { error: 'Time entry is only available for part-time employees.' }
    }

    const ph = await db.publicHoliday.findUnique({
      where: { country_date: { country: user.country, date: workDate } },
    })

    // If editing an existing entry, ensure it's still DRAFT (or REJECTED)
    if (data.entryId) {
      const existing = await db.timeEntry.findUniqueOrThrow({ where: { id: data.entryId } })
      if (existing.userId !== session.userId) {
        return { error: 'You can only edit your own entries.' }
      }
      if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
        return { error: `Cannot edit a ${existing.status.toLowerCase()} entry.` }
      }
    }

    const upsertData = {
      userId: session.userId,
      workDate,
      hoursWorked: data.hoursWorked,
      startTime: isoToTime(data.workDate, data.startTime),
      endTime: isoToTime(data.workDate, data.endTime),
      breakMinutes: data.breakMinutes,
      description: data.description ?? null,
      isPublicHoliday: !!ph,
      status: 'DRAFT' as const,
      // Clear any prior rejection reason if re-saving after a reject
      rejectionReason: null,
      approverId: null,
      submittedAt: null,
      approvedAt: null,
    }

    await db.timeEntry.upsert({
      where: { userId_workDate: { userId: session.userId, workDate } },
      create: upsertData,
      update: upsertData,
    })

    revalidatePath('/time')
    return { success: true }
  } catch (err) {
    console.error('saveTimeEntry error:', err)
    return { error: 'Failed to save time entry.' }
  }
}

// ============================================================
// deleteTimeEntry — employee deletes a DRAFT
// ============================================================

export async function deleteTimeEntry(entryId: string): Promise<TimeEntryActionState> {
  try {
    const session = await verifySession()
    const entry = await db.timeEntry.findUniqueOrThrow({ where: { id: entryId } })
    if (entry.userId !== session.userId && session.role !== 'ADMIN') {
      return { error: 'Not authorised.' }
    }
    if (entry.status !== 'DRAFT' && entry.status !== 'REJECTED') {
      return { error: `Cannot delete a ${entry.status.toLowerCase()} entry.` }
    }
    await db.timeEntry.delete({ where: { id: entryId } })
    await createAuditLog({
      userId: session.userId,
      action: 'TIME_ENTRY_DELETED',
      entityType: 'TIME_ENTRY',
      entityId: entryId,
    })
    revalidatePath('/time')
    return { success: true }
  } catch (err) {
    console.error('deleteTimeEntry error:', err)
    return { error: 'Failed to delete time entry.' }
  }
}

// ============================================================
// submitWeek — promote all DRAFT entries in a week to SUBMITTED
// ============================================================

export async function submitWeek(weekStartIso: string): Promise<TimeEntryActionState & { submitted?: number }> {
  try {
    const session = await verifySession()
    const start = toDateOnly(weekStartIso)
    const end = new Date(start)
    end.setUTCDate(start.getUTCDate() + 6)

    const user = await db.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: { reportingManagerId: true, employmentType: true },
    })
    if (user.employmentType !== 'PART_TIME') {
      return { error: 'Only part-time employees submit timesheets.' }
    }

    const drafts = await db.timeEntry.findMany({
      where: {
        userId: session.userId,
        status: 'DRAFT',
        workDate: { gte: start, lte: end },
      },
      select: { id: true },
    })

    if (drafts.length === 0) {
      return { error: 'No draft entries to submit for this week.' }
    }

    const now = new Date()
    await db.timeEntry.updateMany({
      where: { id: { in: drafts.map(d => d.id) } },
      data: {
        status: 'SUBMITTED',
        submittedAt: now,
        approverId: user.reportingManagerId ?? null,
      },
    })

    for (const d of drafts) {
      await createAuditLog({
        userId: session.userId,
        action: 'TIME_ENTRY_SUBMITTED',
        entityType: 'TIME_ENTRY',
        entityId: d.id,
      })
    }

    revalidatePath('/time')
    revalidatePath('/time/approvals')
    return { success: true, submitted: drafts.length }
  } catch (err) {
    console.error('submitWeek error:', err)
    return { error: 'Failed to submit week.' }
  }
}

// ============================================================
// approveEntry — manager approves a single SUBMITTED entry
// ============================================================

export async function approveEntry(entryId: string): Promise<TimeEntryActionState> {
  try {
    const session = await verifySession()
    const entry = await db.timeEntry.findUniqueOrThrow({ where: { id: entryId } })

    if (entry.approverId !== session.userId && session.role !== 'ADMIN') {
      return { error: 'You are not the assigned approver.' }
    }
    if (entry.status !== 'SUBMITTED') {
      return { error: `Cannot approve a ${entry.status.toLowerCase()} entry.` }
    }

    await db.timeEntry.update({
      where: { id: entryId },
      data: { status: 'APPROVED', approvedAt: new Date(), approverId: session.userId },
    })
    await createAuditLog({
      userId: session.userId,
      action: 'TIME_ENTRY_APPROVED',
      entityType: 'TIME_ENTRY',
      entityId: entryId,
    })
    revalidatePath('/time/approvals')
    return { success: true }
  } catch (err) {
    console.error('approveEntry error:', err)
    return { error: 'Failed to approve entry.' }
  }
}

export async function approveEntries(entryIds: string[]): Promise<TimeEntryActionState & { approved?: number }> {
  try {
    const session = await verifySession()
    if (entryIds.length === 0) return { error: 'No entries selected.' }

    const entries = await db.timeEntry.findMany({
      where: { id: { in: entryIds } },
      select: { id: true, status: true, approverId: true },
    })

    const allowed = entries.filter(
      e =>
        e.status === 'SUBMITTED' &&
        (e.approverId === session.userId || session.role === 'ADMIN'),
    )
    if (allowed.length === 0) return { error: 'None of the selected entries are approvable by you.' }

    const now = new Date()
    await db.timeEntry.updateMany({
      where: { id: { in: allowed.map(e => e.id) } },
      data: { status: 'APPROVED', approvedAt: now, approverId: session.userId },
    })

    for (const e of allowed) {
      await createAuditLog({
        userId: session.userId,
        action: 'TIME_ENTRY_APPROVED',
        entityType: 'TIME_ENTRY',
        entityId: e.id,
      })
    }

    revalidatePath('/time/approvals')
    return { success: true, approved: allowed.length }
  } catch (err) {
    console.error('approveEntries error:', err)
    return { error: 'Failed to approve entries.' }
  }
}

// ============================================================
// rejectEntry — manager rejects with reason → reverts to DRAFT
// ============================================================

export async function rejectEntry(
  _state: TimeEntryActionState,
  formData: FormData,
): Promise<TimeEntryActionState> {
  try {
    const session = await verifySession()
    const parsed = rejectSchema.safeParse(Object.fromEntries(formData.entries()))
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }

    const entry = await db.timeEntry.findUniqueOrThrow({ where: { id: parsed.data.entryId } })
    if (entry.approverId !== session.userId && session.role !== 'ADMIN') {
      return { error: 'You are not the assigned approver.' }
    }
    if (entry.status !== 'SUBMITTED') {
      return { error: `Cannot reject a ${entry.status.toLowerCase()} entry.` }
    }

    await db.timeEntry.update({
      where: { id: entry.id },
      data: { status: 'REJECTED', rejectionReason: parsed.data.reason, approvedAt: null },
    })
    await createAuditLog({
      userId: session.userId,
      action: 'TIME_ENTRY_REJECTED',
      entityType: 'TIME_ENTRY',
      entityId: entry.id,
      details: { reason: parsed.data.reason },
    })
    revalidatePath('/time/approvals')
    revalidatePath('/time')
    return { success: true }
  } catch (err) {
    console.error('rejectEntry error:', err)
    return { error: 'Failed to reject entry.' }
  }
}

// ============================================================
// unlockEntry — admin-only override of an APPROVED entry → DRAFT
// ============================================================

export async function unlockEntry(entryId: string): Promise<TimeEntryActionState> {
  try {
    const session = await requireRole(['ADMIN'])
    const entry = await db.timeEntry.findUniqueOrThrow({ where: { id: entryId } })
    if (entry.status !== 'APPROVED') {
      return { error: 'Only approved entries can be unlocked.' }
    }
    await db.timeEntry.update({
      where: { id: entryId },
      data: { status: 'DRAFT', approvedAt: null },
    })
    await createAuditLog({
      userId: session.userId,
      action: 'TIME_ENTRY_UNLOCKED',
      entityType: 'TIME_ENTRY',
      entityId: entryId,
    })
    revalidatePath('/time/approvals')
    return { success: true }
  } catch (err) {
    console.error('unlockEntry error:', err)
    return { error: 'Failed to unlock entry.' }
  }
}

// ============================================================
// Queries
// ============================================================

/** All entries for the calling user within a given week (Mon–Sun, UTC). */
export async function getMyWeek(weekStartIso?: string) {
  const session = await verifySession()
  const ref = weekStartIso ? toDateOnly(weekStartIso) : new Date()
  const { start, end } = weekBounds(ref)

  const entries = await db.timeEntry.findMany({
    where: { userId: session.userId, workDate: { gte: start, lte: end } },
    orderBy: { workDate: 'asc' },
  })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { country: true, hourlyRate: true, normalDailyHours: true, employmentType: true },
  })

  const holidays = await db.publicHoliday.findMany({
    where: {
      country: user?.country ?? 'SG',
      date: { gte: start, lte: end },
    },
  })

  return {
    weekStart: start,
    weekEnd: end,
    entries,
    holidays,
    user,
  }
}

/** Pending (SUBMITTED) entries for the calling manager's direct reports. */
export async function getPendingApprovals() {
  const session = await verifySession()
  return db.timeEntry.findMany({
    where: { status: 'SUBMITTED', approverId: session.userId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, hourlyRate: true } },
    },
    orderBy: [{ userId: 'asc' }, { workDate: 'asc' }],
  })
}

/** Monthly payroll roll-up: per part-timer, the computed split + pay. */
export async function getMonthlyPayroll(year: number, monthIndex: number) {
  await requireRole(['ADMIN'])
  const { start, end } = monthBounds(year, monthIndex)

  const partTimers = await db.user.findMany({
    where: { employmentType: 'PART_TIME', status: 'ACTIVE' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      country: true,
      hourlyRate: true,
      normalDailyHours: true,
    },
    orderBy: [{ firstName: 'asc' }],
  })

  const allApproved = await db.timeEntry.findMany({
    where: {
      status: 'APPROVED',
      workDate: { gte: start, lte: end },
      userId: { in: partTimers.map(u => u.id) },
    },
    select: { userId: true, workDate: true, hoursWorked: true, isPublicHoliday: true },
  })

  const byUser = new Map<string, typeof allApproved>()
  for (const e of allApproved) {
    const arr = byUser.get(e.userId) ?? []
    arr.push(e)
    byUser.set(e.userId, arr)
  }

  return partTimers.map(u => {
    const entries = byUser.get(u.id) ?? []
    const dailyHours = u.normalDailyHours ? Number(u.normalDailyHours) : 8
    const rate = u.hourlyRate ? Number(u.hourlyRate) : 0
    const breakdown = computePayroll(
      entries.map(e => ({
        workDate: e.workDate,
        hoursWorked: Number(e.hoursWorked),
        isPublicHoliday: e.isPublicHoliday,
      })),
      { normalDailyHours: dailyHours, hourlyRate: rate },
    )
    return {
      user: u,
      currency: u.country === 'MY' ? 'MYR' : 'SGD',
      entryCount: entries.length,
      breakdown,
    }
  })
}
