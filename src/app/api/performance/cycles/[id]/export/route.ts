import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/dal'

const TEMPLATE_LABEL: Record<string, string> = {
  FULL: 'Full review',
  LITE: 'Lite',
  PROBATION: 'Probation',
}

const REVIEW_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not started',
  GOALS_SET: 'Goals set',
  IN_EVALUATION: 'In evaluation',
  PENDING_ACKNOWLEDGEMENT: 'Awaiting employee',
  ACKNOWLEDGED: 'Acknowledged',
}

const OUTCOME_LABEL: Record<string, string> = {
  NOT_EVALUATED: 'Not evaluated',
  MISSED: 'Missed',
  PARTIAL: 'Partial',
  MET: 'Met',
  EXCEEDED: 'Exceeded',
}

const PROBATION_LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmed',
  EXTENDED: 'Extended',
  NOT_CONFIRMED: 'Not confirmed',
}

type Ctx = { params: Promise<{ id: string }> }

function fmtDate(d: Date | null | undefined): string {
  if (!d) return ''
  return new Date(d).toISOString().split('T')[0]
}

export async function GET(_request: NextRequest, ctx: Ctx) {
  await requireRole(['ADMIN'])
  const { id } = await ctx.params

  const cycle = await db.reviewCycle.findUnique({
    where: { id },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      reviews: {
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              country: true,
              department: true,
              position: true,
              employmentType: true,
            },
          },
          manager: { select: { firstName: true, lastName: true, email: true } },
          goals: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ employee: { firstName: 'asc' } }],
      },
    },
  })

  if (!cycle) {
    return NextResponse.json({ error: 'Cycle not found' }, { status: 404 })
  }
  if (cycle.reviews.length === 0) {
    return NextResponse.json({ error: 'Cycle has no reviews to export.' }, { status: 404 })
  }

  const ratingLabels = Array.isArray(cycle.ratingLabels) ? (cycle.ratingLabels as string[]) : []

  // ---- Sheet 1: Reviews (one row per employee) ----
  const reviewRows = cycle.reviews.map(r => {
    const rating = r.overallRating
    const ratingLabel =
      rating !== null && ratingLabels[rating - 1] ? ratingLabels[rating - 1] : ''
    return {
      Employee: `${r.employee.firstName} ${r.employee.lastName}`,
      Email: r.employee.email,
      Country: r.employee.country,
      Department: r.employee.department ?? '',
      Position: r.employee.position ?? '',
      'Employment type': r.employee.employmentType,
      Manager: `${r.manager.firstName} ${r.manager.lastName}`,
      'Manager email': r.manager.email,
      Status: REVIEW_STATUS_LABEL[r.status] ?? r.status,
      'Overall rating': rating ?? '',
      'Rating label': ratingLabel,
      'Manager narrative': r.managerNarrative ?? '',
      'Sales target': r.salesTargetAmount !== null ? Number(r.salesTargetAmount) : '',
      'Sales actual': r.salesActualAmount !== null ? Number(r.salesActualAmount) : '',
      'Attendance days worked': r.attendanceDaysWorked ?? '',
      'Attendance days scheduled': r.attendanceDaysScheduled ?? '',
      'Promotion ready': r.promotionReady === null ? '' : r.promotionReady ? 'Yes' : 'No',
      'Probation decision': r.probationDecision ? PROBATION_LABEL[r.probationDecision] : '',
      'Employee acknowledgement': r.employeeAcknowledgement ?? '',
      'Goals count': r.goals.length,
      'Submitted at': fmtDate(r.submittedForEvaluationAt),
      'Acknowledged at': fmtDate(r.acknowledgedAt),
    }
  })

  // ---- Sheet 2: Goals (one row per goal) ----
  const goalRows = cycle.reviews.flatMap(r =>
    r.goals.map(g => ({
      Employee: `${r.employee.firstName} ${r.employee.lastName}`,
      Email: r.employee.email,
      Manager: `${r.manager.firstName} ${r.manager.lastName}`,
      'Goal title': g.title,
      Description: g.description ?? '',
      Type: g.goalType,
      'Target value': g.targetValue !== null ? Number(g.targetValue) : '',
      'Actual value': g.actualValue !== null ? Number(g.actualValue) : '',
      Unit: g.unit ?? '',
      Weight: g.weight ?? '',
      Outcome: OUTCOME_LABEL[g.outcome] ?? g.outcome,
      'Manager comment': g.managerComment ?? '',
    })),
  )

  // ---- Sheet 3: Rating distribution (HR calibration view) ----
  const ratingCounts = new Map<number, number>()
  for (const r of cycle.reviews) {
    if (r.overallRating !== null) {
      ratingCounts.set(r.overallRating, (ratingCounts.get(r.overallRating) ?? 0) + 1)
    }
  }
  const distributionRows = Array.from({ length: cycle.ratingScale || 0 }, (_, i) => {
    const level = i + 1
    return {
      Level: level,
      Label: ratingLabels[i] ?? '',
      Count: ratingCounts.get(level) ?? 0,
    }
  })

  // ---- Sheet 4: Probation outcomes (only meaningful if PROBATION template) ----
  const probationRows = cycle.reviews
    .filter(r => r.probationDecision !== null)
    .map(r => ({
      Employee: `${r.employee.firstName} ${r.employee.lastName}`,
      Email: r.employee.email,
      Manager: `${r.manager.firstName} ${r.manager.lastName}`,
      Decision: PROBATION_LABEL[r.probationDecision!],
      'Submitted at': fmtDate(r.submittedForEvaluationAt),
      'Acknowledged at': fmtDate(r.acknowledgedAt),
      Notes: r.managerNarrative ?? '',
    }))

  // ---- Sheet 0: Cycle meta ----
  const metaRows = [
    { Field: 'Cycle name', Value: cycle.name },
    { Field: 'Template', Value: TEMPLATE_LABEL[cycle.templateType] ?? cycle.templateType },
    { Field: 'Status', Value: cycle.status },
    { Field: 'Start', Value: fmtDate(cycle.startDate) },
    { Field: 'End', Value: fmtDate(cycle.endDate) },
    { Field: 'Goal-setting deadline', Value: fmtDate(cycle.goalSettingDeadline) },
    { Field: 'Evaluation deadline', Value: fmtDate(cycle.evaluationDeadline) },
    { Field: 'Rating scale', Value: cycle.ratingScale },
    { Field: 'Rating labels', Value: ratingLabels.join(' / ') },
    { Field: 'Min / max goals', Value: `${cycle.minGoals} – ${cycle.maxGoals}` },
    { Field: 'Goal weights enabled', Value: cycle.goalWeightsEnabled ? 'Yes' : 'No' },
    { Field: 'Employee self-assessment', Value: cycle.employeeSelfAssessment ? 'Yes' : 'No' },
    { Field: 'Employee can comment', Value: cycle.employeeCanComment ? 'Yes' : 'No' },
    { Field: 'Manager narrative required', Value: cycle.requireManagerNarrative ? 'Yes' : 'No' },
    { Field: 'Sales target enabled', Value: cycle.includeSalesTarget ? `Yes (${cycle.targetCurrency ?? 'MYR'})` : 'No' },
    { Field: 'Attendance metric enabled', Value: cycle.includeAttendanceMetric ? 'Yes' : 'No' },
    { Field: 'Created by', Value: `${cycle.createdBy.firstName} ${cycle.createdBy.lastName}` },
    { Field: 'Reviews', Value: cycle.reviews.length },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metaRows), 'Cycle')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reviewRows), 'Reviews')
  if (goalRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(goalRows), 'Goals')
  }
  if (cycle.templateType !== 'PROBATION' && distributionRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(distributionRows), 'Rating distribution')
  }
  if (probationRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(probationRows), 'Probation outcomes')
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer
  const filename = `performance-${cycle.name.replace(/[^a-z0-9-]+/gi, '_')}.xlsx`

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
