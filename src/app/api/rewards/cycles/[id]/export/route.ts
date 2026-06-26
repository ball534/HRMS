import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/dal'

const BONUS_LABEL: Record<string, string> = {
  PERFORMANCE: 'Performance',
  CONTRACTUAL_13TH: '13th month',
  AD_HOC: 'Ad-hoc',
}

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, ctx: Ctx) {
  await requireRole(['ADMIN'])
  const { id } = await ctx.params

  const cycle = await db.rewardCycle.findUnique({
    where: { id },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      reviewCycle: { select: { name: true, ratingLabels: true } },
      allocations: {
        where: { status: { in: ['APPROVED', 'PAID'] } },
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              country: true,
              department: true,
              position: true,
            },
          },
          linkedReview: { select: { overallRating: true } },
          approver: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ employee: { firstName: 'asc' } }],
      },
    },
  })

  if (!cycle) {
    return NextResponse.json({ error: 'Cycle not found' }, { status: 404 })
  }
  if (cycle.allocations.length === 0) {
    return NextResponse.json(
      { error: 'No approved or paid allocations to export. Approve the cycle first.' },
      { status: 404 },
    )
  }

  const ratingLabels = Array.isArray(cycle.reviewCycle?.ratingLabels)
    ? (cycle.reviewCycle?.ratingLabels as string[])
    : []

  const rows = cycle.allocations.map(a => {
    const rating = a.linkedReview?.overallRating ?? null
    return {
      Employee: `${a.employee.firstName} ${a.employee.lastName}`,
      Email: a.employee.email,
      Country: a.employee.country,
      Department: a.employee.department ?? '',
      Position: a.employee.position ?? '',
      'Bonus type': BONUS_LABEL[a.bonusType] ?? a.bonusType,
      Currency: a.currency,
      Amount: Number(a.amount),
      Status: a.status,
      Rating: rating ?? '',
      'Rating label': rating !== null && ratingLabels[rating - 1] ? ratingLabels[rating - 1] : '',
      Rationale: a.rationale ?? '',
      'Approved by': a.approver ? `${a.approver.firstName} ${a.approver.lastName}` : '',
      'Approved at': a.approvedAt ? a.approvedAt.toISOString().split('T')[0] : '',
      'Paid at': a.paidAt ? a.paidAt.toISOString().split('T')[0] : '',
    }
  })

  // Summary by bonus type
  const bySection = new Map<string, { total: number; count: number; currency: string }>()
  for (const a of cycle.allocations) {
    const key = a.bonusType
    const e = bySection.get(key) ?? { total: 0, count: 0, currency: a.currency }
    e.total += Number(a.amount)
    e.count += 1
    bySection.set(key, e)
  }
  const summaryRows = Array.from(bySection.entries()).map(([type, v]) => ({
    'Bonus type': BONUS_LABEL[type] ?? type,
    'Allocations': v.count,
    Currency: v.currency,
    'Total amount': v.total,
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Allocations')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer

  const filename = `rewards-${cycle.name.replace(/[^a-z0-9-]+/gi, '_')}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
