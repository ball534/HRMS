import Link from 'next/link'
import { requireCapability } from '@/lib/dal'
import { listRewardCycles } from '@/actions/rewards'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

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

export default async function RewardCyclesListPage() {
  await requireCapability('rewards.admin')
  const cycles = await listRewardCycles()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reward Cycles</h1>
          <p className="text-muted-foreground">
            Create bonus / reward cycles, allocate amounts per employee, and export an
            approved list for payroll.
          </p>
        </div>
        <Link
          href="/rewards/cycles/new"
          className={cn(buttonVariants({ variant: 'default' }))}
        >
          New cycle
        </Link>
      </div>

      {cycles.length === 0 ? (
        <div className="rounded-xl bg-card p-12 text-center ring-1 ring-foreground/10">
          <p className="text-muted-foreground">No reward cycles yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Linked review cycle</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Allocations</th>
                <th className="px-4 py-3 font-medium">Payout</th>
                <th className="px-4 py-3 font-medium">Currency</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.reviewCycle?.name ?? '—'}
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
                  <td className="px-4 py-3 text-muted-foreground">{c._count.allocations}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmt(c.payoutDate)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.currency}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/rewards/cycles/${c.id}`}
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
