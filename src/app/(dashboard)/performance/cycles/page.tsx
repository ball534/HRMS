import Link from 'next/link'
import { requireCapability } from '@/lib/dal'
import { listCycles } from '@/actions/performance'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

const STATUS_PILL: Record<string, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  ACTIVE: 'bg-blue-50 text-blue-700 border-blue-200',
  EVALUATION: 'bg-amber-50 text-amber-700 border-amber-200',
  CLOSED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const TEMPLATE_LABEL: Record<string, string> = {
  FULL: 'Full review',
  LITE: 'Lite (part-time)',
  PROBATION: 'Probation',
}

function fmt(d: Date | string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default async function CyclesListPage() {
  await requireCapability('performance.admin')
  const cycles = await listCycles()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Review Cycles</h1>
          <p className="text-muted-foreground">
            Create and manage periodic performance review cycles. Each cycle has its own
            template, rating scale, and scope.
          </p>
        </div>
        <Link
          href="/performance/cycles/new"
          className={cn(buttonVariants({ variant: 'default' }))}
        >
          New cycle
        </Link>
      </div>

      {cycles.length === 0 ? (
        <div className="rounded-xl bg-card p-12 text-center ring-1 ring-foreground/10">
          <p className="text-muted-foreground">No cycles yet. Create the first one to get started.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Template</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Window</th>
                <th className="px-4 py-3 font-medium">Reviews</th>
                <th className="px-4 py-3 font-medium">Created by</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {TEMPLATE_LABEL[c.templateType] ?? c.templateType}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                        STATUS_PILL[c.status] ?? '',
                      )}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {fmt(c.startDate)} → {fmt(c.endDate)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c._count.reviews}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.createdBy.firstName} {c.createdBy.lastName}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/performance/cycles/${c.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Manage →
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
