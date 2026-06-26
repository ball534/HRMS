import { getMyWeek } from '@/actions/timeEntry'
import { WeeklyTimesheet } from '@/components/time/WeeklyTimesheet'

type Props = {
  searchParams: Promise<{ week?: string }>
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export default async function TimesheetPage({ searchParams }: Props) {
  const sp = await searchParams
  const data = await getMyWeek(sp.week)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Timesheet</h1>
        <p className="text-muted-foreground">
          Log your hours for each day. Submit the whole week to lock it for manager approval.
        </p>
      </div>

      <WeeklyTimesheet
        weekStartIso={ymd(data.weekStart)}
        weekEndIso={ymd(data.weekEnd)}
        entries={data.entries.map(e => ({
          id: e.id,
          workDate: e.workDate.toISOString(),
          hoursWorked: e.hoursWorked.toString(),
          startTime: e.startTime ? e.startTime.toISOString() : null,
          endTime: e.endTime ? e.endTime.toISOString() : null,
          breakMinutes: e.breakMinutes,
          description: e.description,
          isPublicHoliday: e.isPublicHoliday,
          status: e.status,
          rejectionReason: e.rejectionReason,
        }))}
        holidays={data.holidays.map(h => ({
          date: h.date.toISOString(),
          name: h.name,
        }))}
        isPartTime={data.user?.employmentType === 'PART_TIME'}
      />
    </div>
  )
}
