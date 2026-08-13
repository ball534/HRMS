import { requireCapability } from '@/lib/dal'
import { HolidayManager } from '@/components/holidays/HolidayManager'

export default async function HolidaysPage() {
  await requireCapability('holidays.write')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Manage Holidays</h1>
        <p className="text-muted-foreground">
          View and manage public holidays for each country
        </p>
      </div>
      <HolidayManager />
    </div>
  )
}
