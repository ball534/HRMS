import Link from 'next/link'
import { requireCapability } from '@/lib/dal'
import { db } from '@/lib/db'
import { queryAuditLogs, EXCEPTION_ACTIONS } from '@/lib/audit'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { AuditAction, AuditEntityType } from '@/generated/prisma/client'

const ENTITY_TYPES: AuditEntityType[] = [
  'USER',
  'LEAVE',
  'EXPENSE',
  'DOCUMENT',
  'HOLIDAY',
  'REVIEW_CYCLE',
  'PERFORMANCE_REVIEW',
  'TIME_ENTRY',
  'REWARD_CYCLE',
  'REWARD_ALLOCATION',
  'WORK_PASS',
  'BLACKOUT',
  'EMPLOYMENT_LETTER',
  'LEARNING',
  'PAYROLL',
  'SETTING',
  'STATUTORY_RULES',
]

const EXCEPTION_SET = new Set<string>(EXCEPTION_ACTIONS)

type SearchParams = Promise<{
  actor?: string
  entityType?: string
  action?: string
  from?: string
  to?: string
  exceptions?: string
  page?: string
}>

const PAGE_SIZE = 100

function fmtWhen(d: Date): string {
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Renders the `details` JSON in a form a person can read.
 *
 * Field diffs, reversal reasons and export scope are the three shapes that
 * actually matter here, so each gets a readable rendering rather than dumping
 * raw JSON at the reader.
 */
function DetailCell({ action, details }: { action: string; details: unknown }) {
  if (!details || typeof details !== 'object') {
    return <span className="text-muted-foreground">—</span>
  }
  const d = details as Record<string, unknown>

  // Field-level diff (USER_UPDATED)
  if (d.changed && typeof d.changed === 'object') {
    const changed = d.changed as Record<string, { from?: unknown; to?: unknown; changed?: true }>
    const keys = Object.keys(changed)
    if (keys.length === 0) return <span className="text-muted-foreground">no changes</span>
    return (
      <div className="space-y-0.5">
        {keys.map(k => {
          const c = changed[k]
          return (
            <div key={k} className="text-xs">
              <span className="font-medium">{k}</span>{' '}
              {c.changed ? (
                <span className="text-muted-foreground italic">changed (value not logged)</span>
              ) : (
                <span className="text-muted-foreground">
                  {String(c.from ?? '—')} → {String(c.to ?? '—')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Reversal
  if (d.reversal) {
    return (
      <div className="text-xs">
        <span className="font-medium">
          {String(d.from)} → {String(d.to)}
        </span>
        <p className="text-muted-foreground">“{String(d.reason)}”</p>
      </div>
    )
  }

  // Everything else — compact key: value list, skipping noise.
  const entries = Object.entries(d).filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="space-y-0.5">
      {entries.slice(0, 6).map(([k, v]) => (
        <div key={k} className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{k}</span>:{' '}
          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
        </div>
      ))}
    </div>
  )
}

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requireCapability('audit.read')
  const sp = await searchParams

  const page = Math.max(1, Number(sp.page ?? '1') || 1)
  const exceptionsOnly = sp.exceptions === '1'

  const [{ rows, total }, actors] = await Promise.all([
    queryAuditLogs({
      actorId: sp.actor || undefined,
      entityType: (sp.entityType as AuditEntityType) || undefined,
      action: (sp.action as AuditAction) || undefined,
      from: sp.from ? new Date(sp.from) : undefined,
      to: sp.to ? new Date(`${sp.to}T23:59:59.999Z`) : undefined,
      exceptionsOnly,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    // Only people who have actually done something appear in the filter.
    db.user.findMany({
      where: { auditLogs: { some: {} } },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function pageHref(n: number) {
    const params = new URLSearchParams()
    if (sp.actor) params.set('actor', sp.actor)
    if (sp.entityType) params.set('entityType', sp.entityType)
    if (sp.action) params.set('action', sp.action)
    if (sp.from) params.set('from', sp.from)
    if (sp.to) params.set('to', sp.to)
    if (exceptionsOnly) params.set('exceptions', '1')
    params.set('page', String(n))
    return `/admin/audit?${params.toString()}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground">
          Every recorded action across the system — who did it, to what, and when. Reversals and
          data exports carry the reason and the scope.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div className="space-y-1">
          <label htmlFor="actor" className="text-xs font-medium text-muted-foreground">
            Who
          </label>
          <select
            id="actor"
            name="actor"
            defaultValue={sp.actor ?? ''}
            className="h-9 min-w-48 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Anyone</option>
            {actors.map(a => (
              <option key={a.id} value={a.id}>
                {a.firstName} {a.lastName} ({a.role})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="entityType" className="text-xs font-medium text-muted-foreground">
            What
          </label>
          <select
            id="entityType"
            name="entityType"
            defaultValue={sp.entityType ?? ''}
            className="h-9 min-w-40 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Everything</option>
            {ENTITY_TYPES.map(t => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
            From
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={sp.from ?? ''}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
            To
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={sp.to ?? ''}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="exceptions" value="1" defaultChecked={exceptionsOnly} />
          Exceptions only
        </label>

        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Filter
        </button>
        <Link href="/admin/audit" className="h-9 px-2 text-sm leading-9 text-muted-foreground hover:underline">
          Reset
        </Link>
      </form>

      <p className="text-sm text-muted-foreground">
        {total.toLocaleString()} entr{total === 1 ? 'y' : 'ies'}
        {totalPages > 1 && ` · page ${page} of ${totalPages}`}
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">When</TableHead>
              <TableHead className="w-44">Who</TableHead>
              <TableHead className="w-56">Action</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No entries match those filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map(row => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {fmtWhen(row.createdAt)}
                </TableCell>
                <TableCell className="text-sm">
                  <Link href={`/people/${row.user.id}`} className="hover:underline">
                    {row.user.firstName} {row.user.lastName}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{row.user.role}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={EXCEPTION_SET.has(row.action) ? 'destructive' : 'secondary'}>
                    {row.action.replace(/_/g, ' ')}
                  </Badge>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {row.entityType.replace(/_/g, ' ')}
                  </span>
                </TableCell>
                <TableCell>
                  <DetailCell action={row.action} details={row.details} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="text-sm text-primary hover:underline">
              ← Previous
            </Link>
          )}
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="text-sm text-primary hover:underline">
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
