import { AlertTriangle } from 'lucide-react'
import { requireCapability } from '@/lib/dal'
import { getStatutoryRuleSets } from '@/actions/statutory'
import { StatutoryRulesManager } from '@/components/admin/StatutoryRulesManager'

export default async function StatutoryPage() {
  await requireCapability('statutory.write')
  const { rows, missingCountries } = await getStatutoryRuleSets()

  const anyUnverified = rows.some(r => r.inForce && !r.verified) || missingCountries.length > 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Statutory Rules</h1>
        <p className="text-muted-foreground">
          Per-country employment rules — annual leave entitlement, sick leave and overtime — used by
          the leave engine and payroll. Versioned by effective date so a change never rewrites
          figures that were already calculated.
        </p>
      </div>

      {anyUnverified && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            These values have not been confirmed by a qualified adviser
          </p>
          <div className="mt-2 space-y-2 text-muted-foreground">
            <p>
              The figures below were carried over from the previous implementation, which applied a
              single rulebook — drawn from the Malaysian Employment Act — to both Singapore and
              Malaysia. <strong>The Singapore overtime figures are currently the Malaysian ones.</strong>{' '}
              They are separated structurally so they can be corrected here without a code change,
              but they are not correct yet.
            </p>
            <p>
              Employment law is not something this system can determine for you. Have your
              employment-law adviser confirm each value, enter the confirmed figures as a new
              version, then record the sign-off against it. Until then, payroll and leave figures
              derived from these rules should be treated as provisional.
            </p>
          </div>
        </div>
      )}

      <StatutoryRulesManager rows={rows} missingCountries={missingCountries} />
    </div>
  )
}
