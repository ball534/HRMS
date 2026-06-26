import { requireRole } from '@/lib/dal'
import { listBlackouts } from '@/actions/blackouts'
import { BlackoutManager } from '@/components/admin/BlackoutManager'

export default async function BlackoutsPage() {
  await requireRole(['ADMIN'])
  const rows = await listBlackouts()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Blackout Windows</h1>
        <p className="text-muted-foreground">
          Periods during which leave requests are blocked or warned. Use for retail peaks like
          CNY, Hari Raya, Deepavali, or year-end sale.
        </p>
      </div>
      <BlackoutManager
        blackouts={rows.map(b => ({
          id: b.id,
          name: b.name,
          reason: b.reason,
          country: b.country,
          startDate: b.startDate.toISOString(),
          endDate: b.endDate.toISOString(),
          hardBlock: b.hardBlock,
        }))}
      />
    </div>
  )
}
