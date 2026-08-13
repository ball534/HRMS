import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getReviewDetail } from '@/actions/performance'
import { GoalEditor } from '@/components/performance/GoalEditor'
import { GoalEvaluator } from '@/components/performance/GoalEvaluator'
import { ReviewSubmitForm } from '@/components/performance/ReviewSubmitForm'
import { AcknowledgeForm } from '@/components/performance/AcknowledgeForm'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

type Props = {
  params: Promise<{ id: string }>
}

const REVIEW_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not started',
  GOALS_SET: 'Goals set',
  IN_EVALUATION: 'In evaluation',
  PENDING_ACKNOWLEDGEMENT: 'Awaiting acknowledgement',
  ACKNOWLEDGED: 'Acknowledged',
}

const REVIEW_STATUS_PILL: Record<string, string> = {
  NOT_STARTED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  GOALS_SET: 'bg-blue-50 text-blue-700 border-blue-200',
  IN_EVALUATION: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING_ACKNOWLEDGEMENT: 'bg-violet-50 text-violet-700 border-violet-200',
  ACKNOWLEDGED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const OUTCOME_PILL: Record<string, string> = {
  NOT_EVALUATED: 'bg-zinc-100 text-zinc-600',
  MISSED: 'bg-rose-50 text-rose-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  MET: 'bg-blue-50 text-blue-700',
  EXCEEDED: 'bg-emerald-50 text-emerald-700',
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

function fmtDate(d: Date | string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default async function ReviewDetailPage({ params }: Props) {
  const { id } = await params

  let data
  try {
    data = await getReviewDetail(id)
  } catch {
    notFound()
  }

  const { review, viewer } = data
  const cycle = review.cycle
  const labels = Array.isArray(cycle.ratingLabels) ? (cycle.ratingLabels as string[]) : []

  const backHref = viewer.isAdmin
    ? `/performance/cycles/${review.cycleId}`
    : viewer.isManager
    ? '/performance/team'
    : '/performance/me'

  // What can the viewer do right now?
  const canSetGoals =
    viewer.isManager &&
    cycle.status === 'ACTIVE' &&
    (review.status === 'NOT_STARTED' || review.status === 'GOALS_SET') &&
    cycle.templateType === 'FULL'

  const canEvaluate =
    viewer.isManager &&
    cycle.status === 'EVALUATION' &&
    (review.status === 'GOALS_SET' || review.status === 'IN_EVALUATION') &&
    cycle.templateType === 'FULL'

  const canSubmit =
    viewer.isManager &&
    cycle.status === 'EVALUATION' &&
    (review.status === 'GOALS_SET' || review.status === 'IN_EVALUATION')

  const canAcknowledge =
    viewer.isEmployee && review.status === 'PENDING_ACKNOWLEDGEMENT'

  const isSubmitted =
    review.status === 'PENDING_ACKNOWLEDGEMENT' || review.status === 'ACKNOWLEDGED'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href={backHref} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          Back
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">
              {review.employee.firstName} {review.employee.lastName}
            </h1>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                REVIEW_STATUS_PILL[review.status],
              )}
            >
              {REVIEW_STATUS_LABEL[review.status] ?? review.status}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {cycle.name} · {review.employee.position ?? '—'} · {review.employee.department ?? '—'}
          </p>
          <p className="text-sm text-muted-foreground">
            Reviewer: {review.manager.firstName} {review.manager.lastName}
          </p>
        </div>
      </div>

      {/* Cycle state guidance */}
      {cycle.status === 'DRAFT' && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          Cycle is still in DRAFT. The manager cannot set goals until admin opens the cycle.
        </div>
      )}

      {/* Goals — FULL template only */}
      {cycle.templateType === 'FULL' && (
        <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Goals
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {canSetGoals && `Add ${cycle.minGoals}–${cycle.maxGoals} SMART goals before the goal-setting deadline.`}
            {canEvaluate && 'Evaluate each goal and provide a comment.'}
            {!canSetGoals && !canEvaluate && `${review.goals.length} goal${review.goals.length === 1 ? '' : 's'} for this cycle.`}
          </p>

          {canSetGoals ? (
            <GoalEditor
              reviewId={review.id}
              goals={review.goals.map(g => ({
                id: g.id,
                title: g.title,
                description: g.description,
                goalType: g.goalType as 'QUALITATIVE' | 'QUANTITATIVE',
                targetValue: g.targetValue !== null && g.targetValue !== undefined ? String(g.targetValue) : null,
                unit: g.unit,
                weight: g.weight,
              }))}
              weightsEnabled={cycle.goalWeightsEnabled}
              maxGoals={cycle.maxGoals}
            />
          ) : canEvaluate ? (
            <GoalEvaluator
              goals={review.goals.map(g => ({
                id: g.id,
                title: g.title,
                description: g.description,
                goalType: g.goalType as 'QUALITATIVE' | 'QUANTITATIVE',
                targetValue: g.targetValue !== null && g.targetValue !== undefined ? String(g.targetValue) : null,
                actualValue: g.actualValue !== null && g.actualValue !== undefined ? String(g.actualValue) : null,
                unit: g.unit,
                outcome: g.outcome as 'NOT_EVALUATED' | 'MISSED' | 'PARTIAL' | 'MET' | 'EXCEEDED',
                managerComment: g.managerComment,
              }))}
            />
          ) : (
            <ul className="space-y-3">
              {review.goals.length === 0 && (
                <p className="text-sm text-muted-foreground">No goals were set for this cycle.</p>
              )}
              {review.goals.map((g) => (
                <li key={g.id} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{g.title}</h3>
                        {g.goalType === 'QUANTITATIVE' && g.targetValue !== null && (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            Target: {String(g.targetValue)} {g.unit ?? ''}
                          </span>
                        )}
                        {g.goalType === 'QUANTITATIVE' && g.actualValue !== null && (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            Actual: {String(g.actualValue)} {g.unit ?? ''}
                          </span>
                        )}
                      </div>
                      {g.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{g.description}</p>
                      )}
                      {g.managerComment && (
                        <p className="mt-2 text-sm italic text-muted-foreground">
                          &ldquo;{g.managerComment}&rdquo;
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                        OUTCOME_PILL[g.outcome],
                      )}
                    >
                      {OUTCOME_LABEL[g.outcome]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Submit form — manager only, EVALUATION */}
      {canSubmit && (
        <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Submit review
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Once submitted, the review is sent to {review.employee.firstName} for acknowledgement and can no longer be edited (admin can reopen).
          </p>
          <ReviewSubmitForm
            reviewId={review.id}
            templateType={cycle.templateType as 'FULL' | 'LITE' | 'PROBATION'}
            ratingScale={cycle.ratingScale}
            ratingLabels={labels}
            includeSalesTarget={cycle.includeSalesTarget}
            targetCurrency={cycle.targetCurrency}
            includeAttendanceMetric={cycle.includeAttendanceMetric}
            requireManagerNarrative={cycle.requireManagerNarrative}
            existing={{
              overallRating: review.overallRating,
              managerNarrative: review.managerNarrative,
              salesTargetAmount: review.salesTargetAmount !== null && review.salesTargetAmount !== undefined ? String(review.salesTargetAmount) : null,
              salesActualAmount: review.salesActualAmount !== null && review.salesActualAmount !== undefined ? String(review.salesActualAmount) : null,
              attendanceDaysWorked: review.attendanceDaysWorked,
              attendanceDaysScheduled: review.attendanceDaysScheduled,
              promotionReady: review.promotionReady,
              probationDecision: review.probationDecision as 'CONFIRMED' | 'EXTENDED' | 'NOT_CONFIRMED' | null,
            }}
          />
        </section>
      )}

      {/* Read-only result — after submit */}
      {isSubmitted && (
        <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Manager evaluation
          </h2>

          {cycle.templateType === 'PROBATION' ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Probation decision</p>
              <p className="mt-1 text-base font-semibold">
                {review.probationDecision ? PROBATION_LABEL[review.probationDecision] : '—'}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Overall rating</p>
              <p className="mt-1 text-base font-semibold">
                {review.overallRating !== null
                  ? `${review.overallRating} — ${labels[review.overallRating - 1] ?? ''}`
                  : '—'}
              </p>
            </div>
          )}

          {review.managerNarrative && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Narrative</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{review.managerNarrative}</p>
            </div>
          )}

          {cycle.includeSalesTarget && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Sales target ({cycle.targetCurrency ?? 'MYR'})
                </p>
                <p className="mt-1 text-sm">
                  {review.salesTargetAmount !== null && review.salesTargetAmount !== undefined
                    ? String(review.salesTargetAmount)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Sales actual ({cycle.targetCurrency ?? 'MYR'})
                </p>
                <p className="mt-1 text-sm">
                  {review.salesActualAmount !== null && review.salesActualAmount !== undefined
                    ? String(review.salesActualAmount)
                    : '—'}
                </p>
              </div>
            </div>
          )}

          {cycle.includeAttendanceMetric && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Attendance</p>
              <p className="mt-1 text-sm">
                {review.attendanceDaysWorked ?? '—'} of {review.attendanceDaysScheduled ?? '—'} days
              </p>
            </div>
          )}

          {cycle.templateType === 'LITE' && review.promotionReady !== null && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Promotion-ready</p>
              <p className="mt-1 text-sm font-medium">
                {review.promotionReady ? 'Yes — recommended for FT conversion' : 'Not yet'}
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Submitted {fmtDate(review.submittedForEvaluationAt)}
          </p>
        </section>
      )}

      {/* Acknowledge — employee only, PENDING_ACKNOWLEDGEMENT */}
      {canAcknowledge && (
        <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Acknowledge
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Confirm you&apos;ve seen your manager&apos;s evaluation. {cycle.employeeCanComment && 'You can leave a comment first.'}
          </p>
          <AcknowledgeForm reviewId={review.id} allowComment={cycle.employeeCanComment} />
        </section>
      )}

      {/* Employee acknowledgement displayed when present */}
      {review.status === 'ACKNOWLEDGED' && (
        <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Employee acknowledgement
          </h2>
          {review.employeeAcknowledgement ? (
            <p className="whitespace-pre-wrap text-sm">{review.employeeAcknowledgement}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Acknowledged on {fmtDate(review.acknowledgedAt)} (no comment).
            </p>
          )}
        </section>
      )}
    </div>
  )
}
