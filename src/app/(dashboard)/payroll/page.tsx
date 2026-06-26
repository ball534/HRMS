import Link from 'next/link'
import { requireRole } from '@/lib/dal'
import { getMonthlyPayroll } from '@/actions/timeEntry'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

type Props = {
  searchParams: Promise<{ month?: string }>
}

function parseMonth(s: string | undefined): { year: number; monthIndex: number } {
  if (s && /^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split('-').map(Number)
    return { year: y, monthIndex: m - 1 }
  }
  const now = new Date()
  return { year: now.getUTCFullYear(), monthIndex: now.getUTCMonth() }
}

function monthLabel(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function ymKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

function fmt(n: number): string {
  return n.toFixed(2)
}

export default async function PayrollPage({ searchParams }: Props) {
  await requireRole(['ADMIN'])
  const sp = await searchParams
  const { year, monthIndex } = parseMonth(sp.month)
  const rows = await getMonthlyPayroll(year, monthIndex)

  const prev = ymKey(year, monthIndex - 1)
  const next = ymKey(year, monthIndex + 1)
  const current = ymKey(year, monthIndex)

  const grandTotal = rows.reduce((sum, r) => sum + r.breakdown.totalPay, 0)
  const totalHours = rows.reduce((sum, r) => sum + r.breakdown.totalHours, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Part-time Payroll</h1>
          <p className="text-muted-foreground">
            Computed from approved time entries × hourly rate, with MY Employment Act 1955 multipliers
            applied automatically (1.5× over 8h/day or 45h/wk, 2× on PH, 3× for PH overtime).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/payroll?month=${prev}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            ‹ Prev
          </Link>
          <p className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium">
            {monthLabel(year, monthIndex)}
          </p>
          <Link
            href={`/payroll?month=${next}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            Next ›
          </Link>
          <a
            href={`/api/payroll/export-monthly?month=${current}`}
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }))}
          >
            Export Excel
          </a>
        </div>
      </div>

      {/* Roll-up */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Part-timers</p>
          <p className="mt-1 text-2xl font-bold">{rows.length}</p>
        </div>
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total approved hours</p>
          <p className="mt-1 text-2xl font-bold">{fmt(totalHours)}</p>
        </div>
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total payout</p>
          <p className="mt-1 text-2xl font-bold">{fmt(grandTotal)}</p>
          <p className="text-xs text-muted-foreground">Mixed currency — see per-row currency</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium text-right">Hourly rate</th>
              <th className="px-4 py-3 font-medium text-right">Reg h</th>
              <th className="px-4 py-3 font-medium text-right">OT h (1.5×)</th>
              <th className="px-4 py-3 font-medium text-right">PH h (2×)</th>
              <th className="px-4 py-3 font-medium text-right">PH OT h (3×)</th>
              <th className="px-4 py-3 font-medium text-right">Total h</th>
              <th className="px-4 py-3 font-medium text-right">Total pay</th>
              <th className="px-4 py-3 font-medium">Cur.</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                  No part-time employees yet. Set <code className="rounded bg-muted px-1.5 py-0.5 text-xs">employmentType = PART_TIME</code> on users via the People page.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.user.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {r.user.firstName} {r.user.lastName}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.user.email}</div>
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {r.user.hourlyRate ? Number(r.user.hourlyRate).toFixed(2) : '—'}
                </td>
                <td className="px-4 py-3 text-right">{fmt(r.breakdown.regularHours)}</td>
                <td className="px-4 py-3 text-right text-amber-700">
                  {r.breakdown.overtimeHours > 0 ? fmt(r.breakdown.overtimeHours) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-rose-700">
                  {r.breakdown.publicHolidayRegularHours > 0 ? fmt(r.breakdown.publicHolidayRegularHours) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-rose-700">
                  {r.breakdown.publicHolidayOvertimeHours > 0 ? fmt(r.breakdown.publicHolidayOvertimeHours) : '—'}
                </td>
                <td className="px-4 py-3 text-right font-medium">{fmt(r.breakdown.totalHours)}</td>
                <td className="px-4 py-3 text-right font-semibold">{fmt(r.breakdown.totalPay)}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Multipliers per MY Employment Act 1955 (2022 amendment). Pay = (Reg × rate) + (OT × rate × 1.5) +
        (PH × rate × 2) + (PH OT × rate × 3).
      </p>
    </div>
  )
}
