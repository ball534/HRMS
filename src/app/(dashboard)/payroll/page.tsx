import Link from 'next/link'
import { requireCapability } from '@/lib/dal'
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
  await requireCapability('payroll.read')
  const sp = await searchParams
  const { year, monthIndex } = parseMonth(sp.month)
  const rows = await getMonthlyPayroll(year, monthIndex)

  const prev = ymKey(year, monthIndex - 1)
  const next = ymKey(year, monthIndex + 1)
  const current = ymKey(year, monthIndex)

  const grandTotal = rows.reduce((sum, r) => sum + r.breakdown.totalPay, 0)
  const totalHours = rows.reduce((sum, r) => sum + r.breakdown.totalHours, 0)

  /**
   * Show the multiplier in a column header only when every employee on screen
   * shares it. SG and MY have separate rule sets, so once their figures diverge
   * a single hardcoded "1.5×" in the header would be wrong for half the rows.
   */
  function multiplierLabel(which: 'ot' | 'ph' | 'phOt'): string {
    const key =
      which === 'ot'
        ? 'overtimeMultiplier'
        : which === 'ph'
          ? 'publicHolidayMultiplier'
          : 'publicHolidayOvertimeMultiplier'
    const distinct = Array.from(new Set(rows.map(r => r.overtimeRules[key])))
    return distinct.length === 1 ? ` (${distinct[0]}×)` : ''
  }

  const unverifiedRules = rows.some(r => !r.rulesVerified)
  const missingRates = rows
    .filter(r => r.missingHourlyRate && r.entryCount > 0)
    .map(r => `${r.user.firstName} ${r.user.lastName}`)
  const assumedHours = rows
    .filter(r => r.assumedDailyHours && r.entryCount > 0)
    .map(r => `${r.user.firstName} ${r.user.lastName}`)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Part-time Payroll</h1>
          <p className="text-muted-foreground">
            Computed from approved time entries × hourly rate, using each employee&apos;s own country
            overtime rules from the{' '}
            <Link href="/admin/statutory" className="underline">
              statutory rulebook
            </Link>
            .
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

      {/* Data-quality and compliance warnings. These conditions used to be
          entirely silent: a missing hourly rate exported as 0.00, and Singapore
          employees were costed with Malaysian multipliers with no indication. */}
      {(unverifiedRules || missingRates.length > 0 || assumedHours.length > 0) && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          {unverifiedRules && (
            <p>
              <strong>Statutory values are unverified.</strong> The overtime caps and multipliers
              behind these figures have not been confirmed by a qualified employment-law adviser —
              and the Singapore figures are currently the Malaysian ones. Treat these numbers as
              provisional and see{' '}
              <Link href="/admin/statutory" className="underline">
                Statutory Rules
              </Link>
              .
            </p>
          )}
          {missingRates.length > 0 && (
            <p>
              <strong>{missingRates.length} employee(s) have no hourly rate</strong> and are being
              costed at zero: {missingRates.join(', ')}.
            </p>
          )}
          {assumedHours.length > 0 && (
            <p>
              <strong>{assumedHours.length} employee(s) have no normal daily hours set</strong>, so 8
              hours is assumed — which changes where their overtime threshold falls:{' '}
              {assumedHours.join(', ')}.
            </p>
          )}
        </div>
      )}

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
              <th className="px-4 py-3 font-medium text-right">OT h{multiplierLabel('ot')}</th>
              <th className="px-4 py-3 font-medium text-right">PH h{multiplierLabel('ph')}</th>
              <th className="px-4 py-3 font-medium text-right">PH OT h{multiplierLabel('phOt')}</th>
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
        Pay = (Reg × rate) + (OT × rate × OT multiplier) + (PH × rate × PH multiplier) + (PH OT ×
        rate × PH OT multiplier). Each employee is costed against their own country&apos;s
        multipliers from the{' '}
        <Link href="/admin/statutory" className="underline">
          statutory rulebook
        </Link>
        , not one fixed rulebook for both markets. The column headers above show the multipliers
        currently in force.
      </p>
    </div>
  )
}
