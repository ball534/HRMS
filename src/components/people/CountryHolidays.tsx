'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarDays } from 'lucide-react'

type Holiday = {
  id: string
  date: string
  name: string
  type: string
  isObserved: boolean
}

type Props = {
  country: string
}

export function CountryHolidays({ country }: Props) {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (!country) return
    fetch(`/api/holidays?country=${country}&year=2026`)
      .then((r) => r.json())
      .then((data) => {
        const all: Holiday[] = data.holidays ?? []
        // Filter to upcoming (date >= today) and sort
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const upcoming = all.filter((h) => new Date(h.date) >= today)
        setHolidays(upcoming)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [country])

  const displayed = showAll ? holidays : holidays.slice(0, 5)

  const HOLIDAY_TYPE_LABEL: Record<string, string> = {
    PUBLIC_HOLIDAY: '',
    COLLECTIVE_LEAVE: 'Collective Leave',
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          Upcoming Public Holidays
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-muted/30" />
            ))}
          </div>
        ) : holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming holidays</p>
        ) : (
          <div className="space-y-1">
            {displayed.map((h) => (
              <div
                key={h.id}
                className="flex items-start justify-between gap-2 rounded-md px-1 py-1.5 hover:bg-muted/20"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{h.name}</span>
                  {HOLIDAY_TYPE_LABEL[h.type] && (
                    <span className="text-xs text-muted-foreground">
                      {HOLIDAY_TYPE_LABEL[h.type]}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {format(new Date(h.date), 'MMM d')}
                </span>
              </div>
            ))}
            {holidays.length > 5 && (
              <button
                onClick={() => setShowAll((p) => !p)}
                className="mt-1 text-xs text-primary hover:underline"
              >
                {showAll ? 'Show less' : `View all ${holidays.length} holidays`}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
