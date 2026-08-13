import Link from 'next/link'
import { requireCapability } from '@/lib/dal'
import { ReviewCycleForm } from '@/components/performance/ReviewCycleForm'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export default async function NewCyclePage() {
  await requireCapability('performance.admin')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/performance/cycles"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New review cycle</h1>
          <p className="text-muted-foreground">
            Set up a periodic performance review. After creating, you&apos;ll scope it to specific employees.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <ReviewCycleForm />
      </div>
    </div>
  )
}
