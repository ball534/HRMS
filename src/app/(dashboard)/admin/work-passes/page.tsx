import Link from 'next/link'
import { requireRole } from '@/lib/dal'
import { getWorkPassDashboard } from '@/actions/workPass'
import { cn } from '@/lib/utils'

const PASS_TYPE_LABEL: Record<string, string> = {
  NONE: 'None',
  SG_WORK_PERMIT: 'SG WP',
  SG_S_PASS: 'SG S Pass',
  SG_EMPLOYMENT_PASS: 'SG EP',
  SG_DEPENDANT_PASS: 'SG Dep + LOC',
  SG_LTVP_PLUS: 'SG LTVP+',
  MY_WORK_PERMIT: 'MY WP',
  MY_EMPLOYMENT_PASS: 'MY EP',
  MY_DEPENDANT_PASS: 'MY Dep',
  OTHER: 'Other',
}

function fmt(d: Date | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function daysFrom(d: Date | null): string {
  if (!d) return '—'
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const diff = Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return `${-diff}d ago`
  if (diff === 0) return 'today'
  return `${diff}d`
}

export default async function WorkPassesDashboardPage() {
  await requireRole(['ADMIN'])
  const dashboard = await getWorkPassDashboard()

  const buckets: {
    key: 'expired' | 'thirty' | 'sixty' | 'ninety' | 'fine'
    title: string
    rows: typeof dashboard.expired
    cls: string
  }[] = [
    { key: 'expired', title: 'Expired', rows: dashboard.expired, cls: 'bg-rose-50 border-rose-200 text-rose-700' },
    { key: 'thirty', title: 'Expiring in ≤ 30 days', rows: dashboard.thirty, cls: 'bg-rose-50 border-rose-200 text-rose-700' },
    { key: 'sixty', title: 'Expiring in 31–60 days', rows: dashboard.sixty, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
    { key: 'ninety', title: 'Expiring in 61–90 days', rows: dashboard.ninety, cls: 'bg-blue-50 border-blue-200 text-blue-700' },
    { key: 'fine', title: 'OK (more than 90 days out)', rows: dashboard.fine, cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  ]

  const counts = {
    expired: dashboard.expired.length,
    thirty: dashboard.thirty.length,
    sixty: dashboard.sixty.length,
    ninety: dashboard.ninety.length,
    fine: dashboard.fine.length,
  }
  const urgent = counts.expired + counts.thirty

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Work Passes</h1>
        <p className="text-muted-foreground">
          Foreign-worker permit + S Pass + EP expiry tracking, bucketed by urgency. Add or edit a pass
          on each employee&apos;s profile page.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-5">
        {buckets.map(b => (
          <div
            key={b.key}
            className={cn('rounded-xl border bg-card p-4', b.rows.length === 0 ? 'opacity-60' : '')}
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{b.title}</p>
            <p className="mt-1 text-2xl font-bold">{b.rows.length}</p>
          </div>
        ))}
      </div>

      {urgent > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <strong>{urgent}</strong> pass{urgent === 1 ? '' : 'es'} need urgent action (expired or within 30 days).
        </div>
      )}

      {buckets.map(b =>
        b.rows.length === 0 ? null : (
          <section key={b.key} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            <header className="border-b border-border bg-muted/40 px-6 py-3">
              <h2 className="text-sm font-semibold">{b.title} <span className="font-normal text-muted-foreground">({b.rows.length})</span></h2>
            </header>
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Employee</th>
                  <th className="px-6 py-3 font-medium">Pass type</th>
                  <th className="px-6 py-3 font-medium">Number</th>
                  <th className="px-6 py-3 font-medium">Expires</th>
                  <th className="px-6 py-3 font-medium">Time left</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {b.rows.map(p => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-6 py-3">
                      <div className="font-medium">
                        {p.user.firstName} {p.user.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.user.position ?? '—'} · {p.user.department ?? '—'} · {p.user.country}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {PASS_TYPE_LABEL[p.passType] ?? p.passType}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{p.passNumber ?? '—'}</td>
                    <td className="px-6 py-3 text-muted-foreground">{fmt(p.expiryDate)}</td>
                    <td className="px-6 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', b.cls)}>
                        {daysFrom(p.expiryDate)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        href={`/people/${p.user.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ),
      )}
    </div>
  )
}
