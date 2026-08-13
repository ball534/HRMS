import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/dal'
import { db } from '@/lib/db'
import { getCycleReviews, listScopeCandidates } from '@/actions/performance'
import { CycleTransitionControls } from '@/components/performance/CycleTransitionControls'
import { ScopeAssignmentForm } from '@/components/performance/ScopeAssignmentForm'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

type Props = {
  params: Promise<{ id: string }>
}

const CYCLE_STATUS_PILL: Record<string, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  ACTIVE: 'bg-blue-50 text-blue-700 border-blue-200',
  EVALUATION: 'bg-amber-50 text-amber-700 border-amber-200',
  CLOSED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const REVIEW_STATUS_PILL: Record<string, string> = {
  NOT_STARTED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  GOALS_SET: 'bg-blue-50 text-blue-700 border-blue-200',
  IN_EVALUATION: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING_ACKNOWLEDGEMENT: 'bg-violet-50 text-violet-700 border-violet-200',
  ACKNOWLEDGED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const TEMPLATE_LABEL: Record<string, string> = {
  FULL: 'Full review',
  LITE: 'Lite (part-time)',
  PROBATION: 'Probation',
}

const REVIEW_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not started',
  GOALS_SET: 'Goals set',
  IN_EVALUATION: 'In evaluation',
  PENDING_ACKNOWLEDGEMENT: 'Awaiting employee',
  ACKNOWLEDGED: 'Acknowledged',
}

function fmtDate(d: Date | string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function ConfigRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

export default async function CycleDetailPage({ params }: Props) {
  await requireCapability('performance.admin')
  const { id } = await params

  const cycle = await db.reviewCycle.findUnique({
    where: { id },
    include: { createdBy: { select: { firstName: true, lastName: true } } },
  })
  if (!cycle) notFound()

  const reviews = await getCycleReviews(id)
  const candidates = await listScopeCandidates(id)

  const labels = Array.isArray(cycle.ratingLabels) ? (cycle.ratingLabels as string[]) : []
  const scopeDisabled = cycle.status === 'EVALUATION' || cycle.status === 'CLOSED'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/performance/cycles"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          Back
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{cycle.name}</h1>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                CYCLE_STATUS_PILL[cycle.status],
              )}
            >
              {cycle.status}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {TEMPLATE_LABEL[cycle.templateType]} · created by {cycle.createdBy.firstName} {cycle.createdBy.lastName}
          </p>
        </div>
        <a
          href={`/api/performance/cycles/${cycle.id}/export`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          Export Excel
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Config summary */}
        <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Configuration
          </h2>
          <div className="divide-y divide-border">
            <div>
              <ConfigRow label="Cycle window" value={`${fmtDate(cycle.startDate)} → ${fmtDate(cycle.endDate)}`} />
              <ConfigRow label="Goal-setting deadline" value={fmtDate(cycle.goalSettingDeadline)} />
              <ConfigRow label="Evaluation deadline" value={fmtDate(cycle.evaluationDeadline)} />
            </div>
            {cycle.templateType !== 'PROBATION' && (
              <div className="pt-2">
                <ConfigRow label="Rating scale" value={`${cycle.ratingScale} levels`} />
                {labels.length > 0 && (
                  <ConfigRow label="Labels" value={labels.join(' / ')} />
                )}
              </div>
            )}
            {cycle.templateType === 'FULL' && (
              <div className="pt-2">
                <ConfigRow label="Goals per review" value={`${cycle.minGoals} – ${cycle.maxGoals}`} />
                <ConfigRow label="Goal weights" value={cycle.goalWeightsEnabled ? 'Enabled' : 'Disabled'} />
              </div>
            )}
            <div className="pt-2">
              <ConfigRow label="Employee self-assessment" value={cycle.employeeSelfAssessment ? 'Yes' : 'No'} />
              <ConfigRow label="Employee comment" value={cycle.employeeCanComment ? 'Yes' : 'No'} />
              <ConfigRow label="Manager narrative required" value={cycle.requireManagerNarrative ? 'Yes' : 'No'} />
            </div>
            <div className="pt-2">
              <ConfigRow
                label="Sales target"
                value={cycle.includeSalesTarget ? `Enabled (${cycle.targetCurrency ?? 'MYR'})` : 'Disabled'}
              />
              <ConfigRow label="Attendance metric" value={cycle.includeAttendanceMetric ? 'Enabled' : 'Disabled'} />
            </div>
          </div>
        </section>

        {/* Lifecycle */}
        <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Lifecycle
          </h2>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Current status: <span className="font-medium text-foreground">{cycle.status}</span>
            </p>
            <CycleTransitionControls cycleId={cycle.id} status={cycle.status} />
            <ol className="mt-4 space-y-2 border-l-2 border-border pl-3 text-xs text-muted-foreground">
              <li><span className="font-medium text-foreground">DRAFT</span> — config only, no employees notified</li>
              <li><span className="font-medium text-foreground">ACTIVE</span> — managers can set goals</li>
              <li><span className="font-medium text-foreground">EVALUATION</span> — managers evaluate &amp; submit</li>
              <li><span className="font-medium text-foreground">CLOSED</span> — locked, archived for HR</li>
            </ol>
          </div>
        </section>
      </div>

      {/* Scope */}
      <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Scope
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Add ACTIVE employees to this cycle. Reporting manager is snapshotted at the moment of scoping.
        </p>
        <ScopeAssignmentForm
          cycleId={cycle.id}
          disabled={scopeDisabled}
          disabledReason={
            cycle.status === 'EVALUATION'
              ? 'Cycle is in evaluation — scope is locked.'
              : 'Cycle is closed — scope is locked.'
          }
          candidates={candidates}
        />
      </section>

      {/* Reviews list */}
      <section className="rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Reviews in this cycle ({reviews.length})
          </h2>
        </div>
        {reviews.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No employees scoped yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-3 font-medium">Employee</th>
                <th className="px-6 py-3 font-medium">Department</th>
                <th className="px-6 py-3 font-medium">Manager</th>
                <th className="px-6 py-3 font-medium">Goals</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3 font-medium">
                    {r.employee.firstName} {r.employee.lastName}
                    <span className="ml-2 text-xs text-muted-foreground">{r.employee.email}</span>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">{r.employee.department ?? '—'}</td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {r.manager.firstName} {r.manager.lastName}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">{r.goals.length}</td>
                  <td className="px-6 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                        REVIEW_STATUS_PILL[r.status] ?? '',
                      )}
                    >
                      {REVIEW_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Link
                      href={`/performance/${r.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
