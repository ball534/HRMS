'use client'

import { useEffect, useState } from 'react'
import { Calendar, dateFnsLocalizer, Views, NavigateAction } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const locales = {}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
})

type CalendarEvent = {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  resource: {
    type: 'leave' | 'holiday'
    color: string
    userId?: string
    country?: string
    halfDay?: string
  }
}

const COUNTRY_COLORS: Record<string, string> = {
  SG: '#EF4444',
  MY: '#3B82F6',
}

const COUNTRY_LABELS: Record<string, string> = {
  SG: 'Singapore',
  MY: 'Malaysia',
}

export function TeamCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1

    setLoading(true)
    fetch(`/api/calendar/leaves?year=${year}&month=${month}`)
      .then((res) => res.json())
      .then((data) => {
        const parsed = (data.events ?? []).map(
          (e: { id: string; title: string; start: string; end: string; allDay: boolean; resource: CalendarEvent['resource'] }) => ({
            ...e,
            start: new Date(e.start),
            end: new Date(e.end),
          })
        )
        setEvents(parsed)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [currentDate])

  function handleNavigate(date: Date, _view: string, _action: NavigateAction) {
    setCurrentDate(date)
  }

  function eventPropGetter(event: CalendarEvent) {
    return {
      style: {
        backgroundColor: event.resource.color,
        border: 'none',
        borderRadius: '4px',
        fontSize: '0.75rem',
        padding: '2px 6px',
        color: '#fff',
      },
    }
  }

  function dayPropGetter(date: Date) {
    const day = date.getDay()
    const isWeekend = day === 0 || day === 6
    if (isWeekend) {
      return {
        style: { backgroundColor: 'oklch(0.145 0.005 285.823 / 0.5)' },
      }
    }
    return {}
  }

  return (
    <div className="dark-calendar">
      <style>{`
        .dark-calendar .rbc-calendar {
          background: transparent;
          color: #e2e8f0;
        }
        .dark-calendar .rbc-month-view {
          background: oklch(0.21 0.006 285.885);
          border: 1px solid oklch(0.274 0.006 286.618);
          border-radius: 8px;
          overflow: hidden;
        }
        .dark-calendar .rbc-header {
          background: oklch(0.18 0.005 285.823);
          border-bottom: 1px solid oklch(0.274 0.006 286.618);
          color: #94a3b8;
          padding: 8px 0;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .dark-calendar .rbc-header + .rbc-header {
          border-left: 1px solid oklch(0.274 0.006 286.618);
        }
        .dark-calendar .rbc-month-row {
          border-top: 1px solid oklch(0.274 0.006 286.618);
        }
        .dark-calendar .rbc-day-bg {
          background: oklch(0.21 0.006 285.885);
        }
        .dark-calendar .rbc-day-bg + .rbc-day-bg {
          border-left: 1px solid oklch(0.274 0.006 286.618);
        }
        .dark-calendar .rbc-today {
          background: oklch(0.22 0.015 264) !important;
        }
        .dark-calendar .rbc-off-range-bg {
          background: oklch(0.16 0.004 285.823) !important;
        }
        .dark-calendar .rbc-off-range .rbc-button-link {
          color: oklch(0.45 0.005 285.823);
        }
        .dark-calendar .rbc-date-cell {
          color: #94a3b8;
          padding: 4px 8px;
          font-size: 0.8125rem;
        }
        .dark-calendar .rbc-date-cell.rbc-now .rbc-button-link {
          color: #60a5fa;
          font-weight: 700;
        }
        .dark-calendar .rbc-button-link {
          color: inherit;
        }
        .dark-calendar .rbc-show-more {
          color: #60a5fa;
          font-size: 0.75rem;
          background: transparent;
        }
        .dark-calendar .rbc-row-segment {
          padding: 0 2px 1px;
        }
        .dark-calendar .rbc-toolbar {
          padding: 0 0 16px 0;
        }
        .dark-calendar .rbc-toolbar button {
          background: oklch(0.21 0.006 285.885);
          border: 1px solid oklch(0.274 0.006 286.618);
          color: #e2e8f0;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 0.875rem;
          cursor: pointer;
          transition: background 0.15s;
        }
        .dark-calendar .rbc-toolbar button:hover {
          background: oklch(0.274 0.006 286.618);
        }
        .dark-calendar .rbc-toolbar button.rbc-active {
          background: oklch(0.274 0.006 286.618);
          box-shadow: none;
        }
        .dark-calendar .rbc-toolbar-label {
          font-size: 1rem;
          font-weight: 600;
          color: #f1f5f9;
        }
        .dark-calendar .rbc-event {
          outline: none;
        }
        .dark-calendar .rbc-event:focus {
          outline: 2px solid #60a5fa;
        }
        .dark-calendar .rbc-event-content {
          font-size: 0.75rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>

      {loading && (
        <div className="mb-2 text-sm text-muted-foreground">Loading events...</div>
      )}

      <Calendar
        localizer={localizer}
        events={events}
        defaultView={Views.MONTH}
        views={[Views.MONTH]}
        onNavigate={handleNavigate}
        date={currentDate}
        style={{ height: 700 }}
        eventPropGetter={eventPropGetter}
        dayPropGetter={dayPropGetter}
      />

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: '#3B82F6' }} />
          Leave
        </span>
        {Object.entries(COUNTRY_COLORS).map(([code, color]) => (
          <span key={code} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
            {code} – {COUNTRY_LABELS[code]}
          </span>
        ))}
      </div>
    </div>
  )
}
