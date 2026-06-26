import { verifySession } from '@/lib/dal'
import { TeamCalendar } from '@/components/calendar/TeamCalendar'
import { WhosOut } from '@/components/calendar/WhosOut'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function TeamCalendarPage() {
  await verifySession()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team Calendar</h1>
        <p className="text-muted-foreground">
          Approved leave and public holidays across the team
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Calendar — takes most of the width */}
        <div className="min-w-0 flex-1">
          <Card>
            <CardContent className="p-4 md:p-6">
              <TeamCalendar />
            </CardContent>
          </Card>
        </div>

        {/* Who's Out sidebar */}
        <div className="w-full lg:w-72 lg:shrink-0">
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Who&apos;s Out</CardTitle>
            </CardHeader>
            <CardContent>
              <WhosOut />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
