import { requireRole } from '@/lib/dal'
import { db } from '@/lib/db'
import { BalanceAdjustForm } from '@/components/leave/BalanceAdjustForm'
import { EntitlementOverrideForm } from '@/components/leave/EntitlementOverrideForm'
import { CsvImportForm } from '@/components/leave/CsvImportForm'
import { CarryForwardForm } from '@/components/leave/CarryForwardForm'

export default async function AdminLeavePage() {
  await requireRole(['ADMIN', 'HR'])

  const [users, leaveTypes] = await Promise.all([
    db.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    db.leaveType.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Leave Administration</h1>
        <p className="text-muted-foreground">Manage leave balances, import historical data, and run year-end carry-forward</p>
      </div>

      {/* Section 1a: Base Entitlement Override */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Set Base Entitlement</h2>
          <p className="text-sm text-muted-foreground">
            Override the auto-calculated base for a specific employee + year. Use this when HR
            provides a current day-count that doesn&apos;t match the auto formula. Leave the value
            blank to clear the override and revert to auto-calculation.
          </p>
        </div>
        <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <EntitlementOverrideForm users={users} leaveTypes={leaveTypes} />
        </div>
      </section>

      {/* Section 1b: Balance Adjustments */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">One-off Adjustment (+/−)</h2>
          <p className="text-sm text-muted-foreground">
            Add or deduct days from the balance without changing the base. Useful for corrections
            (e.g. comping a public holiday that fell on leave). All adjustments are audit logged.
          </p>
        </div>
        <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <BalanceAdjustForm users={users} leaveTypes={leaveTypes} />
        </div>
      </section>

      {/* Section 2: CSV Import */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Import Historical Leave Data</h2>
          <p className="text-sm text-muted-foreground">
            Import leave records from OmniHR CSV export. Duplicate rows are automatically skipped.
          </p>
        </div>
        <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <CsvImportForm />
        </div>
      </section>

      {/* Section 3: Carry-Forward */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Year-End Carry-Forward</h2>
          <p className="text-sm text-muted-foreground">
            Carry ALL unused Annual Leave days into the next year. Carryover expires March 31 of
            that year — anything not used by then is forfeited automatically.
          </p>
        </div>
        <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <CarryForwardForm />
        </div>
      </section>
    </div>
  )
}
