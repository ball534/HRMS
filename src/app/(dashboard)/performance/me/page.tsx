import Link from 'next/link'
import { verifySession } from '@/lib/dal'
import { getMyReviews } from '@/actions/performance'
import { cn } from '@/lib/utils'

const REVIEW_STATUS_PILL: Record<string, string> = {
  NOT_STARTED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  GOALS_SET: 'bg-blue-50 text-blue-700 border-blue-200',
  IN_EVALUATION: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING_ACKNOWLEDGEMENT: 'bg-violet-50 text-violet-700 border-violet-200',
  ACKNOWLEDGED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const REVIEW_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Manager preparing goals',
  GOALS_SET: 'Goals set',
  IN_EVALUATION: 'Manager evaluating',
  PENDING_ACKNOWLEDGEMENT: 'Awaiting your acknowledgement',
  ACKNOWLEDGED: 'Complete',
}

export default async function MyReviewsPage() {
  await verifySession()
  const reviews = await getMyReviews()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Reviews</h1>
        <p className="text-muted-foreground">
          Your current and past performance reviews.
        </p>
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-xl bg-card p-12 text-center ring-1 ring-foreground/10">
          <p className="text-muted-foreground">
            You have no reviews yet. They&apos;ll appear here once HR scopes a cycle that includes you.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Cycle</th>
                <th className="px-4 py-3 font-medium">Reviewer</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Goals</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{r.cycle.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.manager.firstName} {r.manager.lastName}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                        REVIEW_STATUS_PILL[r.status] ?? '',
                      )}
                    >
                      {REVIEW_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.goals.length}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/performance/${r.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {r.status === 'PENDING_ACKNOWLEDGEMENT' ? 'Acknowledge →' : 'View →'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
