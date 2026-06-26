'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'

// ============================================================
// Types & schemas
// ============================================================

export type RewardActionState = {
  success?: boolean
  error?: string
  errors?: Record<string, string[]>
  cycleId?: string
}

const createCycleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  reviewCycleId: z.string().uuid().optional().nullable(),
  totalPoolAmount: z.coerce.number().optional(),
  currency: z.string().min(1, 'Currency is required').default('MYR'),
  payoutDate: z.string().optional(),
})

const upsertAllocationSchema = z.object({
  cycleId: z.string().uuid(),
  allocationId: z.string().uuid().optional(),
  employeeId: z.string().uuid(),
  bonusType: z.enum(['PERFORMANCE', 'CONTRACTUAL_13TH', 'AD_HOC']).default('PERFORMANCE'),
  amount: z.coerce.number().min(0, 'Amount cannot be negative'),
  rationale: z.string().optional(),
  linkedReviewId: z.string().uuid().optional().nullable(),
})

// ============================================================
// createRewardCycle (ADMIN)
// ============================================================

export async function createRewardCycle(
  _state: RewardActionState,
  formData: FormData,
): Promise<RewardActionState> {
  try {
    const session = await requireRole(['ADMIN'])

    const raw = Object.fromEntries(formData.entries())
    // Form passes empty strings; coerce a couple of optional fields
    if (raw.reviewCycleId === '') delete (raw as Record<string, unknown>).reviewCycleId
    if (raw.payoutDate === '') delete (raw as Record<string, unknown>).payoutDate
    if (raw.totalPoolAmount === '') delete (raw as Record<string, unknown>).totalPoolAmount

    const parsed = createCycleSchema.safeParse(raw)
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }
    const data = parsed.data

    const cycle = await db.rewardCycle.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        reviewCycleId: data.reviewCycleId ?? null,
        totalPoolAmount: data.totalPoolAmount ?? null,
        currency: data.currency,
        payoutDate: data.payoutDate ? new Date(data.payoutDate) : null,
        createdById: session.userId,
      },
    })

    await createAuditLog({
      userId: session.userId,
      action: 'REWARD_CYCLE_CREATED',
      entityType: 'REWARD_CYCLE',
      entityId: cycle.id,
      details: { name: cycle.name },
    })

    revalidatePath('/rewards/cycles')
    return { success: true, cycleId: cycle.id }
  } catch (err) {
    console.error('createRewardCycle error:', err)
    return { error: 'Failed to create reward cycle.' }
  }
}

// ============================================================
// transitionRewardCycle (ADMIN)
// DRAFT → APPROVED → PAID → CLOSED
// ============================================================

export async function transitionRewardCycle(
  cycleId: string,
  to: 'APPROVED' | 'PAID' | 'CLOSED',
): Promise<RewardActionState> {
  try {
    const session = await requireRole(['ADMIN'])
    const cycle = await db.rewardCycle.findUniqueOrThrow({ where: { id: cycleId } })

    const valid: Record<typeof to, string[]> = {
      APPROVED: ['DRAFT'],
      PAID: ['APPROVED'],
      CLOSED: ['PAID', 'APPROVED', 'DRAFT'],
    }
    if (!valid[to].includes(cycle.status)) {
      return { error: `Cannot transition reward cycle from ${cycle.status} to ${to}.` }
    }

    const now = new Date()

    // Bulk-cascade allocation statuses to keep cycle and allocations in sync
    await db.$transaction(async (tx) => {
      await tx.rewardCycle.update({ where: { id: cycleId }, data: { status: to } })

      if (to === 'APPROVED') {
        // Promote DRAFT allocations → APPROVED, stamp approver
        await tx.rewardAllocation.updateMany({
          where: { cycleId, status: 'DRAFT' },
          data: { status: 'APPROVED', approverId: session.userId, approvedAt: now },
        })
      }
      if (to === 'PAID') {
        await tx.rewardAllocation.updateMany({
          where: { cycleId, status: 'APPROVED' },
          data: { status: 'PAID', paidAt: now },
        })
      }
    })

    const action =
      to === 'APPROVED'
        ? 'REWARD_CYCLE_APPROVED'
        : to === 'PAID'
        ? 'REWARD_CYCLE_PAID'
        : 'REWARD_CYCLE_CLOSED'

    await createAuditLog({
      userId: session.userId,
      action,
      entityType: 'REWARD_CYCLE',
      entityId: cycleId,
    })

    revalidatePath(`/rewards/cycles/${cycleId}`)
    revalidatePath('/rewards/cycles')
    return { success: true }
  } catch (err) {
    console.error('transitionRewardCycle error:', err)
    return { error: 'Failed to transition reward cycle.' }
  }
}

// ============================================================
// upsertAllocation (ADMIN)
// ============================================================

export async function upsertAllocation(
  _state: RewardActionState,
  formData: FormData,
): Promise<RewardActionState> {
  try {
    const session = await requireRole(['ADMIN'])

    const raw = Object.fromEntries(formData.entries())
    if (raw.linkedReviewId === '') delete (raw as Record<string, unknown>).linkedReviewId
    if (raw.allocationId === '') delete (raw as Record<string, unknown>).allocationId

    const parsed = upsertAllocationSchema.safeParse(raw)
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }
    const data = parsed.data

    const cycle = await db.rewardCycle.findUniqueOrThrow({ where: { id: data.cycleId } })
    if (cycle.status !== 'DRAFT') {
      return { error: 'Allocations can only be edited on DRAFT reward cycles.' }
    }

    if (data.allocationId) {
      const existing = await db.rewardAllocation.findUniqueOrThrow({ where: { id: data.allocationId } })
      if (existing.cycleId !== data.cycleId) return { error: 'Allocation does not belong to this cycle.' }
      if (existing.status !== 'DRAFT') {
        return { error: `Cannot edit a ${existing.status.toLowerCase()} allocation.` }
      }

      await db.rewardAllocation.update({
        where: { id: data.allocationId },
        data: {
          bonusType: data.bonusType,
          amount: data.amount,
          rationale: data.rationale ?? null,
          linkedReviewId: data.linkedReviewId ?? null,
        },
      })
    } else {
      await db.rewardAllocation.create({
        data: {
          cycleId: data.cycleId,
          employeeId: data.employeeId,
          bonusType: data.bonusType,
          amount: data.amount,
          currency: cycle.currency,
          rationale: data.rationale ?? null,
          linkedReviewId: data.linkedReviewId ?? null,
          proposedById: session.userId,
          status: 'DRAFT',
        },
      })
    }

    await createAuditLog({
      userId: session.userId,
      action: 'REWARD_ALLOCATION_SAVED',
      entityType: 'REWARD_ALLOCATION',
      entityId: data.allocationId ?? data.cycleId,
      details: { employeeId: data.employeeId, amount: data.amount, bonusType: data.bonusType },
    })

    revalidatePath(`/rewards/cycles/${data.cycleId}`)
    return { success: true }
  } catch (err: unknown) {
    // Unique constraint (cycleId, employeeId, bonusType)
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      return { error: 'This employee already has an allocation of that bonus type in this cycle.' }
    }
    console.error('upsertAllocation error:', err)
    return { error: 'Failed to save allocation.' }
  }
}

// ============================================================
// cancelAllocation (ADMIN)
// ============================================================

export async function cancelAllocation(allocationId: string): Promise<RewardActionState> {
  try {
    const session = await requireRole(['ADMIN'])
    const alloc = await db.rewardAllocation.findUniqueOrThrow({ where: { id: allocationId } })
    if (alloc.status === 'PAID') {
      return { error: 'Cannot cancel a paid allocation.' }
    }
    await db.rewardAllocation.update({
      where: { id: allocationId },
      data: { status: 'CANCELLED' },
    })
    await createAuditLog({
      userId: session.userId,
      action: 'REWARD_ALLOCATION_CANCELLED',
      entityType: 'REWARD_ALLOCATION',
      entityId: allocationId,
    })
    revalidatePath(`/rewards/cycles/${alloc.cycleId}`)
    return { success: true }
  } catch (err) {
    console.error('cancelAllocation error:', err)
    return { error: 'Failed to cancel allocation.' }
  }
}

// ============================================================
// Queries
// ============================================================

export async function listRewardCycles() {
  await requireRole(['ADMIN'])
  return db.rewardCycle.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      reviewCycle: { select: { name: true } },
      _count: { select: { allocations: true } },
    },
  })
}

export async function getRewardCycle(id: string) {
  await requireRole(['ADMIN'])
  return db.rewardCycle.findUnique({
    where: { id },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      reviewCycle: { select: { id: true, name: true, ratingScale: true, ratingLabels: true } },
      allocations: {
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, email: true, country: true, position: true, department: true } },
          linkedReview: { select: { id: true, overallRating: true } },
          approver: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ employee: { firstName: 'asc' } }],
      },
    },
  })
}

/**
 * For a given reward cycle, return active users with their (optional) linked review
 * for the cycle's associated ReviewCycle. Used by the "Add allocation" picker.
 */
export async function listCandidatesForCycle(cycleId: string) {
  await requireRole(['ADMIN'])
  const cycle = await db.rewardCycle.findUniqueOrThrow({
    where: { id: cycleId },
    select: { reviewCycleId: true },
  })

  const users = await db.user.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      country: true,
      position: true,
      department: true,
    },
    orderBy: [{ firstName: 'asc' }],
  })

  let reviewByEmployee = new Map<string, { id: string; overallRating: number | null }>()
  if (cycle.reviewCycleId) {
    const reviews = await db.performanceReview.findMany({
      where: { cycleId: cycle.reviewCycleId },
      select: { id: true, employeeId: true, overallRating: true },
    })
    reviewByEmployee = new Map(reviews.map(r => [r.employeeId, { id: r.id, overallRating: r.overallRating }]))
  }

  return users.map(u => ({
    ...u,
    linkedReview: reviewByEmployee.get(u.id) ?? null,
  }))
}
