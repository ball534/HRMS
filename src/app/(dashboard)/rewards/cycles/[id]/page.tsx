import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/dal'
import { getRewardCycle, listCandidatesForCycle } from '@/actions/rewards'
import { AllocationManager } from '@/components/rewards/AllocationManager'
import { CycleTransitionControls } from '@/components/rewards/CycleTransitionControls'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

type Props = {
  params: Promise<{ id: string }>
}

const STATUS_PILL: Record<string, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  APPROVED: 'bg-blue-50 text-blue-700 border-blue-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CLOSED: 'bg-violet-50 text-violet-700 border-violet-200',
}

function fmt(d: Date | string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default async function RewardCycleDetailPage({ params }: Props) {
  await requireRole(['ADMIN'])
  const { id } = await params

  const cycle = await getRewardCycle(id)
  if (!cycle) notFound()

  const candidates = await listCandidatesForCycle(id)

  const ratingLabels =
    cycle.reviewCycle && Array.isArray(cycle.reviewCycle.ratingLabels)
      ? (cycle.reviewCycle.ratingLabels as string[])
      : null

  const activeAllocations = cycle.allocations.filter(a => a.status !== 'CANCELLED')

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Link
          href="/rewards/cycles"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          Back
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{cycle.name}</h1>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                STATUS_PILL[cycle.status],
              )}
            >
              {cycle.status}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Created by {cycle.createdBy.firstName} {cycle.createdBy.lastName}
            {cycle.reviewCycle && (
              <>
                {' '}· linked to{' '}
                <span className="font-medium text-foreground">{cycle.reviewCycle.name}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Summary */}
        <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Cycle
          </h2>
          <dl className="divide-y divide-border text-sm">
            <div className="flex justify-between py-1.5">
              <dt className="text-muted-foreground">Currency</dt>
              <dd className="font-medium">{cycle.currency}</dd>
            </div>
            {cycle.totalPoolAmount !== null && (
              <div className="flex justify-between py-1.5">
                <dt className="text-muted-foreground">Total pool</dt>
                <dd className="font-medium">
                  {cycle.currency} {Number(cycle.totalPoolAmount).toFixed(2)}
                </dd>
              </div>
            )}
            <div className="flex justify-between py-1.5">
              <dt className="text-muted-foreground">Payout date</dt>
              <dd className="font-medium">{fmt(cycle.payoutDate)}</dd>
            </div>
            <div className="flex justify-between py-1.5">
              <dt className="text-muted-foreground">Linked performance cycle</dt>
              <dd className="text-right">{cycle.reviewCycle?.name ?? '—'}</dd>
            </div>
            {cycle.description && (
              <div className="py-1.5">
                <dt className="text-muted-foreground">Description</dt>
                <dd className="mt-1 text-sm">{cycle.description}</dd>
              </div>
            )}
          </dl>

          <div className="mt-4 flex justify-end">
            <a
              href={`/api/rewards/cycles/${cycle.id}/export`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              Export Excel
            </a>
          </div>
        </section>

        {/* Lifecycle */}
        <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Lifecycle
          </h2>
          <p className="text-sm text-muted-foreground">
            Current status: <span className="font-medium text-foreground">{cycle.status}</span>
          </p>
          <div className="mt-3">
            <CycleTransitionControls
              cycleId={cycle.id}
              status={cycle.status}
              hasAllocations={activeAllocations.length > 0}
            />
          </div>
          <ol className="mt-4 space-y-2 border-l-2 border-border pl-3 text-xs text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">DRAFT</span> — HR proposes amounts
            </li>
            <li>
              <span className="font-medium text-foreground">APPROVED</span> — allocations locked, ready for payroll
            </li>
            <li>
              <span className="font-medium text-foreground">PAID</span> — amounts handed off to payroll
            </li>
            <li>
              <span className="font-medium text-foreground">CLOSED</span> — archived
            </li>
          </ol>
        </section>
      </div>

      <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Allocations
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Pick employees and assign bonus amounts. When the cycle is approved, all draft allocations
          are stamped with the approver and locked.
        </p>

        <AllocationManager
          cycleId={cycle.id}
          cycleStatus={cycle.status}
          currency={cycle.currency}
          candidates={candidates.map(c => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email,
            country: c.country,
            position: c.position,
            department: c.department,
            linkedReview: c.linkedReview,
          }))}
          allocations={cycle.allocations.map(a => ({
            id: a.id,
            employeeId: a.employeeId,
            bonusType: a.bonusType,
            amount: a.amount.toString(),
            currency: a.currency,
            rationale: a.rationale,
            status: a.status,
            linkedReviewId: a.linkedReviewId,
            linkedReviewRating: a.linkedReview?.overallRating ?? null,
            approver: a.approver,
            approvedAt: a.approvedAt?.toISOString() ?? null,
            paidAt: a.paidAt?.toISOString() ?? null,
          }))}
          ratingLabels={ratingLabels}
        />
      </section>
    </div>
  )
}
