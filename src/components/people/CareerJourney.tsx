'use client'

import { format, differenceInCalendarMonths } from 'date-fns'
import {
  Briefcase,
  TrendingUp,
  Building2,
  BadgeCheck,
  DoorOpen,
  Hourglass,
  Sparkles,
  ArrowRight,
} from 'lucide-react'

export type CareerEventItem = {
  id: string
  type: 'JOINED' | 'POSITION_CHANGE' | 'DEPARTMENT_CHANGE' | 'CONFIRMED' | 'TERMINATED'
  title: string
  detail?: string | null
  fromValue?: string | null
  toValue?: string | null
  effectiveDate: string
}

type Props = {
  events: CareerEventItem[]
  user: {
    firstName: string
    position?: string | null
    department?: string | null
    company?: string | null
    startDate?: string | null
    probationEndDate?: string | null
    confirmationDate?: string | null
    status: string
  }
}

type JourneyNode = {
  key: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  detail?: string | null
  fromValue?: string | null
  toValue?: string | null
  date: Date
  upcoming: boolean
  accent: string // tailwind classes for the node circle
}

const NODE_STYLES: Record<string, { icon: React.ComponentType<{ className?: string }>; accent: string }> = {
  JOINED: { icon: Briefcase, accent: 'bg-blue-500 ring-blue-100' },
  POSITION_CHANGE: { icon: TrendingUp, accent: 'bg-violet-500 ring-violet-100' },
  DEPARTMENT_CHANGE: { icon: Building2, accent: 'bg-cyan-500 ring-cyan-100' },
  CONFIRMED: { icon: BadgeCheck, accent: 'bg-emerald-500 ring-emerald-100' },
  TERMINATED: { icon: DoorOpen, accent: 'bg-rose-500 ring-rose-100' },
  PROBATION: { icon: Hourglass, accent: 'bg-amber-500 ring-amber-100' },
  PRESENT: { icon: Sparkles, accent: 'bg-primary ring-primary/20' },
}

function formatSpan(from: Date, to: Date): string | null {
  const months = differenceInCalendarMonths(to, from)
  if (months < 1) return null
  const yrs = Math.floor(months / 12)
  const mos = months % 12
  const parts: string[] = []
  if (yrs > 0) parts.push(`${yrs} yr${yrs === 1 ? '' : 's'}`)
  if (mos > 0) parts.push(`${mos} mo`)
  return parts.join(' ')
}

export function CareerJourney({ events, user }: Props) {
  const now = new Date()

  const nodes: JourneyNode[] = events.map(e => ({
    key: e.id,
    icon: NODE_STYLES[e.type].icon,
    accent: NODE_STYLES[e.type].accent,
    title: e.title,
    detail: e.detail,
    fromValue: e.fromValue,
    toValue: e.toValue,
    date: new Date(e.effectiveDate),
    upcoming: new Date(e.effectiveDate) > now,
  }))

  // Derived milestone: probation end, if no confirmation has been recorded yet.
  const hasConfirmation = events.some(e => e.type === 'CONFIRMED')
  if (user.probationEndDate && !hasConfirmation && user.status === 'ACTIVE') {
    const end = new Date(user.probationEndDate)
    nodes.push({
      key: 'probation-end',
      icon: NODE_STYLES.PROBATION.icon,
      accent: NODE_STYLES.PROBATION.accent,
      title: end > now ? 'Probation ends' : 'Probation period ended',
      detail: end > now ? 'Confirmation pending' : 'Awaiting confirmation',
      date: end,
      upcoming: end > now,
    })
  }

  nodes.sort((a, b) => a.date.getTime() - b.date.getTime())

  // Closing node: where the journey stands today.
  const hasLeft = events.some(e => e.type === 'TERMINATED')
  if (!hasLeft && user.status === 'ACTIVE') {
    nodes.push({
      key: 'present',
      icon: NODE_STYLES.PRESENT.icon,
      accent: NODE_STYLES.PRESENT.accent,
      title: user.position ? `${user.position} — today` : 'Today',
      detail: [user.department, user.company].filter(Boolean).join(' · ') || null,
      date: now,
      upcoming: false,
    })
  }

  const journeyStart = user.startDate ? new Date(user.startDate) : nodes[0]?.date
  const journeyEnd = hasLeft
    ? nodes.filter(n => !n.upcoming).at(-1)?.date ?? now
    : now
  const tenure = journeyStart ? formatSpan(journeyStart, journeyEnd) : null
  const roleCount = 1 + events.filter(e => e.type === 'POSITION_CHANGE').length

  if (nodes.length === 0) {
    return (
      <div className="rounded-xl bg-card p-8 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
        Your journey will appear here once your employment details are recorded.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
          <p className="text-xs text-muted-foreground">Time with the company</p>
          <p className="text-lg font-semibold">{tenure ?? 'Just started'}</p>
        </div>
        <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
          <p className="text-xs text-muted-foreground">Roles held</p>
          <p className="text-lg font-semibold">{roleCount}</p>
        </div>
        <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
          <p className="text-xs text-muted-foreground">Milestones</p>
          <p className="text-lg font-semibold">{nodes.length}</p>
        </div>
      </div>

      {/* Flow timeline */}
      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <ol>
          {nodes.map((node, i) => {
            const Icon = node.icon
            const next = nodes[i + 1]
            const span = next ? formatSpan(node.date, next.date) : null
            return (
              <li key={node.key} className="relative flex gap-4">
                {/* Rail: node circle + connector to the next node */}
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ring-4 ${node.accent} ${
                      node.upcoming ? 'opacity-50' : ''
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  {next && (
                    <div className="relative flex min-h-10 w-px flex-1 justify-center">
                      <div
                        className={`w-px flex-1 ${
                          next.upcoming
                            ? 'border-l border-dashed border-foreground/25'
                            : 'bg-foreground/15'
                        }`}
                      />
                      {span && (
                        <span className="absolute top-1/2 -translate-y-1/2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                          {span}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card */}
                <div className={`flex-1 pb-8 ${node.upcoming ? 'opacity-60' : ''}`}>
                  <div
                    className={`rounded-lg border p-4 ${
                      node.upcoming ? 'border-dashed border-foreground/20' : 'border-border bg-background/50'
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="font-semibold">{node.title}</p>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {node.upcoming && 'Expected '}
                        {format(node.date, 'MMM d, yyyy')}
                      </p>
                    </div>
                    {node.detail && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{node.detail}</p>
                    )}
                    {node.fromValue && node.toValue && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {node.fromValue}
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-medium text-foreground">{node.toValue}</span>
                      </p>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
