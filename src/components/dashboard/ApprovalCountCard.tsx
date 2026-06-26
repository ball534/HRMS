'use client'

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  count: number
  label: string
  href: string
}

export function ApprovalCountCard({ count, label, href }: Props) {
  if (count === 0) return null

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 flex items-center justify-between">
      <div>
        <div className="text-3xl font-bold text-primary">{count}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">{label}</div>
      </div>
      <Link
        href={href}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
      >
        Review
      </Link>
    </div>
  )
}
