import { NextRequest, NextResponse } from 'next/server'
import { addDays, startOfDay } from 'date-fns'
import { db } from '@/lib/db'
import { verifySession } from '@/lib/dal'

const COUNTRY_COLORS: Record<string, string> = {
  SG: '#EF4444',
  MY: '#3B82F6',
}

function getCountryColor(country: string): string {
  return COUNTRY_COLORS[country] ?? '#6B7280'
}

export async function GET(request: NextRequest) {
  await verifySession()

  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope')

  // --- Who's Out mode: scope=today or scope=tomorrow ---
  if (scope === 'today' || scope === 'tomorrow') {
    const base = startOfDay(new Date())
    const targetDate = scope === 'tomorrow' ? addDays(base, 1) : base

    const leaves = await db.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: targetDate },
        endDate: { gte: targetDate },
      },
      include: {
        user: { select: { firstName: true, lastName: true, country: true } },
        leaveType: { select: { name: true } },
      },
      orderBy: { user: { firstName: 'asc' } },
    })

    const events = leaves.map((leave) => ({
      id: leave.id,
      title: `${leave.user.firstName} ${leave.user.lastName}`,
      firstName: leave.user.firstName,
      lastName: leave.user.lastName,
      country: leave.user.country,
      leaveType: leave.leaveType.name,
      halfDay: leave.halfDay,
      start: leave.startDate,
      end: leave.endDate,
      allDay: true,
    }))

    return NextResponse.json({ events })
  }

  // --- Monthly calendar mode ---
  const yearParam = searchParams.get('year')
  const monthParam = searchParams.get('month')

  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()
  const month = monthParam ? parseInt(monthParam, 10) : new Date().getMonth() + 1

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year or month parameters' }, { status: 400 })
  }

  const startOfMonth = new Date(Date.UTC(year, month - 1, 1))
  const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

  const [leaves, holidays] = await Promise.all([
    db.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: endOfMonth },
        endDate: { gte: startOfMonth },
      },
      include: {
        user: { select: { firstName: true, lastName: true, country: true } },
        leaveType: { select: { name: true } },
      },
    }),
    db.publicHoliday.findMany({
      where: {
        date: { gte: startOfMonth, lte: endOfMonth },
        isObserved: true,
      },
    }),
  ])

  const leaveEvents = leaves.map((leave) => ({
    id: leave.id,
    title: `${leave.user.firstName} ${leave.user.lastName[0]}. — ${leave.leaveType.name}`,
    start: leave.startDate,
    end: addDays(leave.endDate, 1), // RBC end is EXCLUSIVE for all-day events
    allDay: true,
    resource: {
      type: 'leave' as const,
      userId: leave.userId,
      color: '#3B82F6',
      halfDay: leave.halfDay,
    },
  }))

  const holidayEvents = holidays.map((holiday) => ({
    id: holiday.id,
    title: `${holiday.country}: ${holiday.name}`,
    start: holiday.date,
    end: addDays(holiday.date, 1), // single-day, exclusive end
    allDay: true,
    resource: {
      type: 'holiday' as const,
      country: holiday.country,
      color: getCountryColor(holiday.country),
    },
  }))

  return NextResponse.json({ events: [...leaveEvents, ...holidayEvents] })
}
