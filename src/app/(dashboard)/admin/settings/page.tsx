import { requireCapability } from '@/lib/dal'
import { getSettingsForAdmin } from '@/actions/settings'
import { SettingsManager } from '@/components/admin/SettingsManager'

export default async function SettingsPage() {
  await requireCapability('settings.write')
  const { rows, approverOptions } = await getSettingsForAdmin()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Operational settings for the whole organisation. Every change is recorded in the audit
          log with the previous value.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Statutory rules — annual leave entitlement, sick-leave banding and overtime multipliers
          — are country-specific and live on the{' '}
          <a href="/admin/statutory" className="underline">
            Statutory Rules
          </a>{' '}
          page.
        </p>
      </div>

      <SettingsManager rows={rows} approverOptions={approverOptions} />
    </div>
  )
}
