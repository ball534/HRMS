'use client'

import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { Check, Clock, Circle, X } from 'lucide-react'

export type TimelineStep = {
  label: string
  actor: string
  actedAt: string | null
  status: 'completed' | 'active' | 'pending' | 'rejected'
  comment?: string | null
}

type ApprovalTimelineProps = {
  steps: TimelineStep[]
}

export function ApprovalTimeline({ steps }: ApprovalTimelineProps) {
  return (
    <ol className="relative space-y-6 border-l border-border ml-3">
      {steps.map((step, i) => (
        <li key={i} className="ml-6">
          <span
            className={cn(
              'absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background',
              step.status === 'completed' && 'bg-emerald-600',
              step.status === 'active' && 'bg-amber-500',
              step.status === 'pending' && 'bg-zinc-300',
              step.status === 'rejected' && 'bg-rose-600',
            )}
          >
            {step.status === 'completed' && <Check className="h-3 w-3 text-white" />}
            {step.status === 'active' && <Clock className="h-3 w-3 text-white" />}
            {step.status === 'pending' && <Circle className="h-3 w-3 text-zinc-500" />}
            {step.status === 'rejected' && <X className="h-3 w-3 text-white" />}
          </span>
          <p className="text-sm font-medium text-foreground">{step.label}</p>
          <p className="text-xs text-muted-foreground">{step.actor}</p>
          {step.actedAt && (
            <time className="text-xs text-muted-foreground">
              {format(new Date(step.actedAt), 'dd MMM yyyy HH:mm')}
            </time>
          )}
          {step.comment && (
            <p className="mt-1 text-xs italic text-muted-foreground">&quot;{step.comment}&quot;</p>
          )}
        </li>
      ))}
    </ol>
  )
}
