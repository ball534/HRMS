import Link from 'next/link'
import { requireCapability } from '@/lib/dal'
import { db } from '@/lib/db'
import { RewardCycleForm } from '@/components/rewards/RewardCycleForm'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export default async function NewRewardCyclePage() {
  await requireCapability('rewards.admin')

  // Offer all review cycles that have reached EVALUATION or CLOSED as
  // "linkable" — earlier cycles don't have ratings yet so linking is premature.
  const reviewCycles = await db.reviewCycle.findMany({
    where: { status: { in: ['EVALUATION', 'CLOSED'] } },
    select: { id: true, name: true, status: true },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/rewards/cycles"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New reward cycle</h1>
          <p className="text-muted-foreground">
            After creating, you&apos;ll allocate amounts per employee.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-xl rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <RewardCycleForm reviewCycles={reviewCycles} />
      </div>
    </div>
  )
}
