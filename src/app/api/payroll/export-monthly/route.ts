import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { requireCapabilityApi, withApiAuth } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import { computePayroll, monthBounds } from '@/lib/payroll'
import { resolveRules } from '@/lib/statutory'

export async function GET(request: NextRequest) {
  return withApiAuth(() => handler(request))
}

async function handler(request: NextRequest) {
  // Pay figures and every part-timer's email leave the app in this file, so it
  // is ADMIN-only and — unlike before — recorded in the audit log.
  const session = await requireCapabilityApi('payroll.export')

  const monthParam = request.nextUrl.searchParams.get('month') ?? ''
  const match = /^(\d{4})-(\d{2})$/.exec(monthParam)
  const now = new Date()
  const year = match ? Number(match[1]) : now.getUTCFullYear()
  const monthIndex = match ? Number(match[2]) - 1 : now.getUTCMonth()

  const { start, end } = monthBounds(year, monthIndex)

  const partTimers = await db.user.findMany({
    where: { employmentType: 'PART_TIME', status: 'ACTIVE' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      country: true,
      hourlyRate: true,
      normalDailyHours: true,
    },
    orderBy: [{ firstName: 'asc' }],
  })

  const entries = await db.timeEntry.findMany({
    where: {
      status: 'APPROVED',
      workDate: { gte: start, lte: end },
      userId: { in: partTimers.map(u => u.id) },
    },
    select: { userId: true, workDate: true, hoursWorked: true, isPublicHoliday: true },
    orderBy: [{ userId: 'asc' }, { workDate: 'asc' }],
  })

  // Per-country overtime rules, as they stood at the end of the pay month.
  const [sgRules, myRules] = await Promise.all([resolveRules('SG', end), resolveRules('MY', end)])

  // -------- Summary sheet --------
  const summaryRows: Array<Record<string, string | number>> = []
  for (const u of partTimers) {
    const userEntries = entries.filter(e => e.userId === u.id)
    const dailyHours = u.normalDailyHours ? Number(u.normalDailyHours) : 8
    const rate = u.hourlyRate ? Number(u.hourlyRate) : 0
    const resolved = u.country === 'MY' ? myRules : sgRules
    const ot = resolved.rules.overtime
    const b = computePayroll(
      userEntries.map(e => ({
        workDate: e.workDate,
        hoursWorked: Number(e.hoursWorked),
        isPublicHoliday: e.isPublicHoliday,
      })),
      { normalDailyHours: dailyHours, hourlyRate: rate, rules: ot },
    )
    summaryRows.push({
      Employee: `${u.firstName} ${u.lastName}`,
      Email: u.email,
      Country: u.country,
      Currency: u.country === 'MY' ? 'MYR' : 'SGD',
      'Hourly rate': rate,
      'Normal daily hours': dailyHours,
      'Regular hours': b.regularHours,
      [`OT hours (${ot.overtimeMultiplier}×)`]: b.overtimeHours,
      [`PH hours (${ot.publicHolidayMultiplier}×)`]: b.publicHolidayRegularHours,
      [`PH OT hours (${ot.publicHolidayOvertimeMultiplier}×)`]: b.publicHolidayOvertimeHours,
      'Total hours': b.totalHours,
      'Regular pay': b.regularPay,
      'OT pay': b.overtimePay,
      'PH pay': b.publicHolidayRegularPay,
      'PH OT pay': b.publicHolidayOvertimePay,
      'Total pay': b.totalPay,
      // A reader of this file needs to know whether the figures rest on
      // statutory values anyone has actually signed off.
      'Statutory rules verified': resolved.verified ? 'Yes' : 'NO — UNVERIFIED',
      'Rate missing': rate === 0 ? 'YES — paid as zero' : '',
    })
  }

  // -------- Line items sheet --------
  const lineRows = entries.map(e => {
    const u = partTimers.find(p => p.id === e.userId)!
    return {
      Employee: `${u.firstName} ${u.lastName}`,
      Email: u.email,
      Date: e.workDate.toISOString().split('T')[0],
      'Hours worked': Number(e.hoursWorked),
      'Public holiday': e.isPublicHoliday ? 'Yes' : 'No',
      'Hourly rate': u.hourlyRate ? Number(u.hourlyRate) : 0,
    }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lineRows), 'Line items')

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer

  await createAuditLog({
    userId: session.userId,
    action: 'PAYROLL_EXPORTED',
    entityType: 'PAYROLL',
    details: {
      month: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
      employeeCount: partTimers.length,
      entryCount: entries.length,
      includesEmails: true,
      includesPayRates: true,
    },
  })

  const filename = `payroll-${year}-${String(monthIndex + 1).padStart(2, '0')}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
