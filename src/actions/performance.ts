'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { verifySession, requireCapability } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { notify } from '@/lib/notify'
import { assertNotSelf, tryResolveApprover, SelfApprovalError } from '@/lib/approvers'
import { createAuditLog } from '@/lib/audit'

// ============================================================
// Types
// ============================================================

export type ReviewActionState = {
  success?: boolean
  error?: string
  errors?: Record<string, string[]>
  cycleId?: string
}

// ============================================================
// Zod schemas
// ============================================================

const createCycleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  templateType: z.enum(['FULL', 'LITE', 'PROBATION']),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  goalSettingDeadline: z.string().optional(),
  evaluationOpensAt: z.string().optional(),
  evaluationDeadline: z.string().optional(),
  ratingScale: z.coerce.number().int().min(2).max(10).optional(),
  ratingLabels: z.string().optional(), // JSON string from form
  minGoals: z.coerce.number().int().min(0).max(20).optional(),
  maxGoals: z.coerce.number().int().min(1).max(20).optional(),
  goalWeightsEnabled: z.string().optional(),
  employeeSelfAssessment: z.string().optional(),
  employeeCanComment: z.string().optional(),
  requireManagerNarrative: z.string().optional(),
  includeSalesTarget: z.string().optional(),
  targetCurrency: z.string().optional(),
  includeAttendanceMetric: z.string().optional(),
})

const goalSchema = z.object({
  reviewId: z.string().uuid(),
  goalId: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  goalType: z.enum(['QUALITATIVE', 'QUANTITATIVE']).default('QUALITATIVE'),
  targetValue: z.coerce.number().optional(),
  unit: z.string().optional(),
  weight: z.coerce.number().int().min(0).max(100).optional(),
})

const evaluateGoalSchema = z.object({
  goalId: z.string().uuid(),
  outcome: z.enum(['MISSED', 'PARTIAL', 'MET', 'EXCEEDED']),
  actualValue: z.coerce.number().optional(),
  managerComment: z.string().optional(),
})

const submitReviewSchema = z.object({
  reviewId: z.string().uuid(),
  overallRating: z.coerce.number().int().optional(),
  managerNarrative: z.string().optional(),
  salesActualAmount: z.coerce.number().optional(),
  attendanceDaysWorked: z.coerce.number().int().optional(),
  attendanceDaysScheduled: z.coerce.number().int().optional(),
  promotionReady: z.string().optional(),
  probationDecision: z.enum(['CONFIRMED', 'EXTENDED', 'NOT_CONFIRMED']).optional(),
})

// ============================================================
// Helpers
// ============================================================

function boolFromForm(v: unknown): boolean {
  return v === 'true' || v === 'on' || v === '1'
}

function defaultLabelsForScale(scale: number): string[] {
  if (scale === 3) return ['Below', 'Meets', 'Exceeds']
  if (scale === 5) return ['Below', 'Approaching', 'Meets', 'Exceeds', 'Outstanding']
  return Array.from({ length: scale }, (_, i) => `Level ${i + 1}`)
}

// ============================================================
// createReviewCycle (performance.admin)
// ============================================================

export async function createReviewCycle(
  _state: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  try {
    const session = await requireCapability('performance.admin')

    const raw = Object.fromEntries(formData.entries())
    const parsed = createCycleSchema.safeParse(raw)
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }
    const data = parsed.data

    const templateType = data.templateType

    // Resolve rating scale + labels (defaults differ by template)
    const ratingScale =
      data.ratingScale ?? (templateType === 'LITE' ? 3 : templateType === 'PROBATION' ? 0 : 5)
    let ratingLabels: string[]
    if (data.ratingLabels) {
      try {
        const parsedLabels = JSON.parse(data.ratingLabels)
        if (!Array.isArray(parsedLabels)) throw new Error('not array')
        ratingLabels = parsedLabels.map(String)
      } catch {
        return { error: 'ratingLabels must be a JSON array of strings' }
      }
    } else {
      ratingLabels = defaultLabelsForScale(ratingScale || 5)
    }

    const cycle = await db.reviewCycle.create({
      data: {
        name: data.name,
        templateType,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        goalSettingDeadline: data.goalSettingDeadline ? new Date(data.goalSettingDeadline) : null,
        evaluationOpensAt: data.evaluationOpensAt ? new Date(data.evaluationOpensAt) : null,
        evaluationDeadline: data.evaluationDeadline ? new Date(data.evaluationDeadline) : null,
        ratingScale,
        ratingLabels,
        minGoals: data.minGoals ?? (templateType === 'LITE' ? 0 : 3),
        maxGoals: data.maxGoals ?? (templateType === 'LITE' ? 0 : 7),
        goalWeightsEnabled: boolFromForm(data.goalWeightsEnabled),
        employeeSelfAssessment: boolFromForm(data.employeeSelfAssessment),
        employeeCanComment: data.employeeCanComment === undefined ? true : boolFromForm(data.employeeCanComment),
        requireManagerNarrative: data.requireManagerNarrative === undefined ? true : boolFromForm(data.requireManagerNarrative),
        includeSalesTarget: boolFromForm(data.includeSalesTarget),
        targetCurrency: data.targetCurrency || null,
        includeAttendanceMetric: boolFromForm(data.includeAttendanceMetric),
        createdById: session.userId,
      },
    })

    await createAuditLog({
      userId: session.userId,
      action: 'REVIEW_CYCLE_CREATED',
      entityType: 'REVIEW_CYCLE',
      entityId: cycle.id,
      details: { name: cycle.name, templateType: cycle.templateType },
    })

    revalidatePath('/performance/cycles')
    return { success: true, cycleId: cycle.id }
  } catch (err) {
    console.error('createReviewCycle error:', err)
    return { error: 'Failed to create review cycle.' }
  }
}

// ============================================================
// scopeReviews — admin assigns employees to a cycle
// ============================================================

export async function scopeReviews(
  cycleId: string,
  filters: {
    employmentType?: 'EMPLOYEE' | 'CONTRACTOR' | 'PART_TIME' | 'ALL'
    country?: 'SG' | 'MY' | 'ALL'
    department?: string | null
    employeeIds?: string[] // if provided, takes precedence over filters
  }
): Promise<{ created: number; error?: string }> {
  try {
    const session = await requireCapability('performance.admin')

    const cycle = await db.reviewCycle.findUniqueOrThrow({ where: { id: cycleId } })
    if (cycle.status !== 'DRAFT' && cycle.status !== 'ACTIVE') {
      return { created: 0, error: `Cannot scope a ${cycle.status.toLowerCase()} cycle.` }
    }

    let users: { id: string; reportingManagerId: string | null; firstName: string; lastName: string }[]
    if (filters.employeeIds && filters.employeeIds.length > 0) {
      users = await db.user.findMany({
        where: { id: { in: filters.employeeIds }, status: 'ACTIVE' },
        select: { id: true, reportingManagerId: true, firstName: true, lastName: true },
      })
    } else {
      users = await db.user.findMany({
        where: {
          status: 'ACTIVE',
          ...(filters.employmentType && filters.employmentType !== 'ALL'
            ? { employmentType: filters.employmentType }
            : {}),
          ...(filters.country && filters.country !== 'ALL' ? { country: filters.country } : {}),
          ...(filters.department ? { department: filters.department } : {}),
        },
        select: { id: true, reportingManagerId: true, firstName: true, lastName: true },
      })
    }

    // Snapshot the reviewer at scope time.
    //
    // This used to be `managerId: u.reportingManagerId ?? u.id` — an employee
    // with no reporting manager became *their own reviewer*, setting their own
    // goals and writing their own rating, which then fed the bonus picker. The
    // code comment claimed "admin can reassign" but no reassignment action
    // existed anywhere in the product.
    //
    // Now the standard chain resolves a real reviewer who is never the
    // employee. If the organisation genuinely has nobody else (a single-user
    // database), the review is skipped and reported rather than silently
    // becoming a self-review.
    const existing = await db.performanceReview.findMany({
      where: { cycleId, employeeId: { in: users.map(u => u.id) } },
      select: { employeeId: true },
    })
    const existingSet = new Set(existing.map(e => e.employeeId))
    const toCreate = users.filter(u => !existingSet.has(u.id))

    if (toCreate.length === 0) return { created: 0 }

    const resolved: { cycleId: string; employeeId: string; managerId: string; status: 'NOT_STARTED' }[] = []
    const unresolvable: string[] = []

    for (const u of toCreate) {
      const approver = await tryResolveApprover(u.id)
      if (!approver) {
        unresolvable.push(`${u.firstName} ${u.lastName}`)
        continue
      }
      resolved.push({
        cycleId,
        employeeId: u.id,
        managerId: approver.approverId,
        status: 'NOT_STARTED',
      })
    }

    if (resolved.length) {
      await db.performanceReview.createMany({ data: resolved })
    }

    await createAuditLog({
      userId: session.userId,
      action: 'REVIEW_CYCLE_CREATED',
      entityType: 'REVIEW_CYCLE',
      entityId: cycleId,
      details: { scoped: resolved.length, skippedNoReviewer: unresolvable },
    })

    revalidatePath(`/performance/cycles/${cycleId}`)
    return {
      created: resolved.length,
      // Surfaced rather than swallowed — a silently skipped employee looks
      // identical to one who was never in scope.
      error: unresolvable.length
        ? `Scoped ${resolved.length}. No reviewer could be resolved for: ${unresolvable.join(', ')}. Set a fallback approver in Settings → Approvals.`
        : undefined,
    }
  } catch (err) {
    console.error('scopeReviews error:', err)
    return { created: 0, error: 'Failed to scope reviews.' }
  }
}

// ============================================================
// transitionCycle — DRAFT → ACTIVE → EVALUATION → CLOSED
// ============================================================

export async function transitionCycle(
  cycleId: string,
  to: 'ACTIVE' | 'EVALUATION' | 'CLOSED'
): Promise<ReviewActionState> {
  try {
    const session = await requireCapability('performance.admin')

    const cycle = await db.reviewCycle.findUniqueOrThrow({ where: { id: cycleId } })

    const valid: Record<typeof to, string[]> = {
      ACTIVE: ['DRAFT'],
      EVALUATION: ['ACTIVE'],
      CLOSED: ['EVALUATION', 'ACTIVE'],
    }
    if (!valid[to].includes(cycle.status)) {
      return { error: `Cannot transition cycle from ${cycle.status} to ${to}.` }
    }

    await db.reviewCycle.update({ where: { id: cycleId }, data: { status: to } })

    const action =
      to === 'ACTIVE'
        ? 'REVIEW_CYCLE_OPENED'
        : to === 'EVALUATION'
        ? 'REVIEW_CYCLE_EVALUATION_OPENED'
        : 'REVIEW_CYCLE_CLOSED'

    await createAuditLog({
      userId: session.userId,
      action,
      entityType: 'REVIEW_CYCLE',
      entityId: cycleId,
    })

    revalidatePath(`/performance/cycles/${cycleId}`)
    revalidatePath('/performance/cycles')
    return { success: true }
  } catch (err) {
    console.error('transitionCycle error:', err)
    return { error: 'Failed to transition cycle.' }
  }
}

// ============================================================
// upsertGoal (MANAGER, only during ACTIVE)
// ============================================================

export async function upsertGoal(
  _state: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  try {
    const session = await verifySession()
    const raw = Object.fromEntries(formData.entries())
    const parsed = goalSchema.safeParse(raw)
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }
    const data = parsed.data

    const review = await db.performanceReview.findUniqueOrThrow({
      where: { id: data.reviewId },
      include: { cycle: true },
    })

    if (session.userId !== review.managerId && !can(session.role, 'performance.admin')) {
      return { error: 'Only the assigned manager can set goals.' }
    }
    if (review.cycle.status !== 'ACTIVE') {
      return { error: 'Goals can only be edited while the cycle is ACTIVE.' }
    }

    if (data.goalId) {
      await db.goal.update({
        where: { id: data.goalId },
        data: {
          title: data.title,
          description: data.description ?? null,
          goalType: data.goalType,
          targetValue: data.targetValue ?? null,
          unit: data.unit ?? null,
          weight: data.weight ?? null,
        },
      })
    } else {
      // enforce maxGoals
      const count = await db.goal.count({ where: { reviewId: data.reviewId } })
      if (count >= review.cycle.maxGoals) {
        return { error: `Maximum ${review.cycle.maxGoals} goals reached.` }
      }
      await db.goal.create({
        data: {
          reviewId: data.reviewId,
          title: data.title,
          description: data.description ?? null,
          goalType: data.goalType,
          targetValue: data.targetValue ?? null,
          unit: data.unit ?? null,
          weight: data.weight ?? null,
        },
      })
    }

    // Promote NOT_STARTED → GOALS_SET if minGoals met
    const goalCount = await db.goal.count({ where: { reviewId: data.reviewId } })
    if (review.status === 'NOT_STARTED' && goalCount >= review.cycle.minGoals) {
      await db.performanceReview.update({
        where: { id: data.reviewId },
        data: { status: 'GOALS_SET' },
      })
      await createAuditLog({
        userId: session.userId,
        action: 'REVIEW_GOALS_SET',
        entityType: 'PERFORMANCE_REVIEW',
        entityId: data.reviewId,
      })
    }

    revalidatePath(`/performance/${data.reviewId}`)
    return { success: true }
  } catch (err) {
    console.error('upsertGoal error:', err)
    return { error: 'Failed to save goal.' }
  }
}

export async function deleteGoal(goalId: string): Promise<ReviewActionState> {
  try {
    const session = await verifySession()
    const goal = await db.goal.findUniqueOrThrow({
      where: { id: goalId },
      include: { review: { include: { cycle: true } } },
    })
    if (session.userId !== goal.review.managerId && !can(session.role, 'performance.admin')) {
      return { error: 'Only the assigned manager can delete goals.' }
    }
    if (goal.review.cycle.status !== 'ACTIVE') {
      return { error: 'Goals can only be deleted while the cycle is ACTIVE.' }
    }
    await db.goal.delete({ where: { id: goalId } })
    revalidatePath(`/performance/${goal.reviewId}`)
    return { success: true }
  } catch (err) {
    console.error('deleteGoal error:', err)
    return { error: 'Failed to delete goal.' }
  }
}

// ============================================================
// evaluateGoal (MANAGER, only during EVALUATION)
// ============================================================

export async function evaluateGoal(
  _state: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  try {
    const session = await verifySession()
    const raw = Object.fromEntries(formData.entries())
    const parsed = evaluateGoalSchema.safeParse(raw)
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }
    const data = parsed.data

    const goal = await db.goal.findUniqueOrThrow({
      where: { id: data.goalId },
      include: { review: { include: { cycle: true } } },
    })

    if (session.userId !== goal.review.managerId && !can(session.role, 'performance.admin')) {
      return { error: 'Only the assigned manager can evaluate goals.' }
    }
    if (goal.review.cycle.status !== 'EVALUATION') {
      return { error: 'Goals can only be evaluated during the EVALUATION phase.' }
    }

    await db.goal.update({
      where: { id: data.goalId },
      data: {
        outcome: data.outcome,
        actualValue: data.actualValue ?? null,
        managerComment: data.managerComment ?? null,
      },
    })

    // Mark review as IN_EVALUATION if not yet
    if (goal.review.status === 'GOALS_SET') {
      await db.performanceReview.update({
        where: { id: goal.reviewId },
        data: { status: 'IN_EVALUATION' },
      })
    }

    revalidatePath(`/performance/${goal.reviewId}`)
    return { success: true }
  } catch (err) {
    console.error('evaluateGoal error:', err)
    return { error: 'Failed to evaluate goal.' }
  }
}

// ============================================================
// submitReview (MANAGER, during EVALUATION) — locks for employee ack
// ============================================================

export async function submitReview(
  _state: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  try {
    const session = await verifySession()
    const raw = Object.fromEntries(formData.entries())
    const parsed = submitReviewSchema.safeParse(raw)
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }
    const data = parsed.data

    const review = await db.performanceReview.findUniqueOrThrow({
      where: { id: data.reviewId },
      include: { cycle: true, goals: true },
    })

    if (session.userId !== review.managerId && !can(session.role, 'performance.admin')) {
      return { error: 'Only the assigned manager can submit this review.' }
    }
    // Belt and braces: reviews created before the scoping fix may still carry
    // managerId === employeeId, and nobody should rate themselves.
    try {
      await assertNotSelf(session.userId, review.employeeId, 'performance review')
    } catch (err) {
      if (err instanceof SelfApprovalError) {
        return {
          error:
            'You cannot submit your own performance review. Ask HR to reassign the reviewer on this review.',
        }
      }
      throw err
    }
    if (review.cycle.status !== 'EVALUATION') {
      return { error: 'Reviews can only be submitted during the EVALUATION phase.' }
    }

    // Template-specific validation
    if (review.cycle.templateType !== 'PROBATION') {
      if (data.overallRating === undefined) {
        return { error: 'Overall rating is required.' }
      }
      if (
        data.overallRating < 1 ||
        data.overallRating > review.cycle.ratingScale
      ) {
        return { error: `Rating must be between 1 and ${review.cycle.ratingScale}.` }
      }
    }

    if (review.cycle.templateType === 'PROBATION' && !data.probationDecision) {
      return { error: 'Probation decision is required to submit a probation review.' }
    }

    if (review.cycle.requireManagerNarrative && !data.managerNarrative) {
      return { error: 'Manager narrative is required for this cycle.' }
    }

    // All non-probation goals must have been evaluated
    if (review.cycle.templateType !== 'PROBATION') {
      const unevaluated = review.goals.filter(g => g.outcome === 'NOT_EVALUATED')
      if (unevaluated.length > 0) {
        return { error: `Evaluate all goals before submitting (${unevaluated.length} pending).` }
      }
    }

    await db.performanceReview.update({
      where: { id: data.reviewId },
      data: {
        status: 'PENDING_ACKNOWLEDGEMENT',
        overallRating: data.overallRating ?? null,
        managerNarrative: data.managerNarrative ?? null,
        salesActualAmount: data.salesActualAmount ?? null,
        attendanceDaysWorked: data.attendanceDaysWorked ?? null,
        attendanceDaysScheduled: data.attendanceDaysScheduled ?? null,
        promotionReady:
          data.promotionReady === undefined
            ? null
            : data.promotionReady === 'true' || data.promotionReady === 'on',
        probationDecision: data.probationDecision ?? null,
        submittedForEvaluationAt: new Date(),
      },
    })

    await createAuditLog({
      userId: session.userId,
      action: 'REVIEW_SUBMITTED',
      entityType: 'PERFORMANCE_REVIEW',
      entityId: data.reviewId,
      details: {
        overallRating: data.overallRating,
        probationDecision: data.probationDecision,
      },
    })

    await notify({
      userId: review.employeeId,
      type: 'PERFORMANCE_ACK_REQUIRED',
      title: 'Your performance review is ready to read',
      body: `${review.cycle.name} — your reviewer has submitted it and it is waiting for your acknowledgement.`,
      linkUrl: `/performance/${data.reviewId}`,
    })

    if (data.probationDecision) {
      const probationAction =
        data.probationDecision === 'CONFIRMED'
          ? 'PROBATION_CONFIRMED'
          : data.probationDecision === 'EXTENDED'
          ? 'PROBATION_EXTENDED'
          : 'PROBATION_NOT_CONFIRMED'
      await createAuditLog({
        userId: session.userId,
        action: probationAction,
        entityType: 'PERFORMANCE_REVIEW',
        entityId: data.reviewId,
        details: { employeeId: review.employeeId },
      })
    }

    revalidatePath(`/performance/${data.reviewId}`)
    revalidatePath('/performance/team')
    return { success: true }
  } catch (err) {
    console.error('submitReview error:', err)
    return { error: 'Failed to submit review.' }
  }
}

// ============================================================
// acknowledgeReview (EMPLOYEE — own review only)
// ============================================================

export async function acknowledgeReview(
  _state: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  try {
    const session = await verifySession()
    const reviewId = formData.get('reviewId') as string
    const comment = (formData.get('comment') as string) || undefined

    if (!reviewId) return { error: 'Review ID is required.' }

    const review = await db.performanceReview.findUniqueOrThrow({
      where: { id: reviewId },
    })

    if (session.userId !== review.employeeId) {
      return { error: 'Only the reviewed employee can acknowledge this review.' }
    }
    if (review.status !== 'PENDING_ACKNOWLEDGEMENT') {
      return { error: 'This review is not pending acknowledgement.' }
    }

    await db.performanceReview.update({
      where: { id: reviewId },
      data: {
        status: 'ACKNOWLEDGED',
        employeeAcknowledgement: comment ?? null,
        acknowledgedAt: new Date(),
      },
    })

    await createAuditLog({
      userId: session.userId,
      action: 'REVIEW_ACKNOWLEDGED',
      entityType: 'PERFORMANCE_REVIEW',
      entityId: reviewId,
    })

    revalidatePath(`/performance/${reviewId}`)
    revalidatePath('/performance/me')
    return { success: true }
  } catch (err) {
    console.error('acknowledgeReview error:', err)
    return { error: 'Failed to acknowledge review.' }
  }
}

// ============================================================
// reopenReview (performance.admin — unlocks an acknowledged review)
// ============================================================

export async function reopenReview(reviewId: string): Promise<ReviewActionState> {
  try {
    const session = await requireCapability('performance.admin')
    const review = await db.performanceReview.findUniqueOrThrow({ where: { id: reviewId } })
    if (review.status !== 'ACKNOWLEDGED') {
      return { error: 'Only acknowledged reviews can be reopened.' }
    }
    await db.performanceReview.update({
      where: { id: reviewId },
      data: { status: 'IN_EVALUATION', acknowledgedAt: null },
    })
    await createAuditLog({
      userId: session.userId,
      action: 'REVIEW_REOPENED',
      entityType: 'PERFORMANCE_REVIEW',
      entityId: reviewId,
    })
    revalidatePath(`/performance/${reviewId}`)
    return { success: true }
  } catch (err) {
    console.error('reopenReview error:', err)
    return { error: 'Failed to reopen review.' }
  }
}

// ============================================================
// Queries
// ============================================================

export async function getMyReviews() {
  const session = await verifySession()
  return db.performanceReview.findMany({
    where: { employeeId: session.userId },
    include: {
      cycle: true,
      manager: { select: { firstName: true, lastName: true } },
      goals: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getTeamReviews() {
  const session = await verifySession()
  return db.performanceReview.findMany({
    where: { managerId: session.userId },
    include: {
      cycle: true,
      employee: { select: { firstName: true, lastName: true, email: true, position: true } },
      goals: { select: { id: true, outcome: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })
}

export async function getCycleReviews(cycleId: string) {
  await requireCapability('performance.admin')
  return db.performanceReview.findMany({
    where: { cycleId },
    include: {
      employee: { select: { firstName: true, lastName: true, email: true, department: true } },
      manager: { select: { firstName: true, lastName: true } },
      goals: { select: { id: true, outcome: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function getReviewDetail(reviewId: string) {
  const session = await verifySession()
  const review = await db.performanceReview.findUniqueOrThrow({
    where: { id: reviewId },
    include: {
      cycle: true,
      employee: { select: { id: true, firstName: true, lastName: true, email: true, position: true, department: true, country: true, employmentType: true } },
      manager: { select: { id: true, firstName: true, lastName: true, email: true } },
      goals: { orderBy: { createdAt: 'asc' } },
    },
  })

  // Authorization: employee sees their own, the assigned manager sees theirs,
  // and whoever administers cycles sees all of them.
  const isEmployee = review.employeeId === session.userId
  const isManager = review.managerId === session.userId
  const isAdmin = can(session.role, 'performance.admin')
  if (!isEmployee && !isManager && !isAdmin) {
    throw new Error('Not authorised to view this review')
  }

  return { review, viewer: { isEmployee, isManager, isAdmin } }
}

export async function listCycles() {
  await requireCapability('performance.admin')
  return db.reviewCycle.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      _count: { select: { reviews: true } },
    },
  })
}

/**
 * Active users not yet scoped into a given cycle — used by the per-employee
 * picker in ScopeAssignmentForm.
 */
export async function listScopeCandidates(cycleId: string) {
  await requireCapability('performance.admin')
  const existing = await db.performanceReview.findMany({
    where: { cycleId },
    select: { employeeId: true },
  })
  const skip = new Set(existing.map(e => e.employeeId))
  const users = await db.user.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      country: true,
      department: true,
      position: true,
      employmentType: true,
    },
    orderBy: [{ firstName: 'asc' }],
  })
  return users.filter(u => !skip.has(u.id))
}
