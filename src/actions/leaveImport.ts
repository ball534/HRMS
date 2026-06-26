'use server'

import { requireRole } from '@/lib/dal'
import { db } from '@/lib/db'

export type ImportState = {
  imported?: number
  skipped?: number
  errors?: string[]
  error?: string
}

/**
 * Imports historical leave data from a CSV file exported from OmniHR.
 *
 * Expected CSV columns (header row required):
 *   employee_email, leave_type, start_date, end_date, days, status, approved_by_email, year
 *
 * - Each row is processed individually; errors are collected and returned without aborting
 * - Idempotency: rows with the same userId + leaveTypeId + startDate + endDate are skipped
 * - Imported records are created with status APPROVED (historical data)
 * - Balance `used` field is incremented for the relevant year
 */
export async function importLeaveCsv(
  _state: ImportState,
  formData: FormData
): Promise<ImportState> {
  await requireRole(['ADMIN'])

  const file = formData.get('csv') as File
  if (!file || file.size === 0) return { error: 'No CSV file provided' }

  const text = await file.text()
  const lines = text.trim().split('\n')
  if (lines.length < 2) {
    return { error: 'CSV must have a header row and at least one data row' }
  }

  // Header-based column lookup for flexibility
  const header = lines[0].split(',').map(h => h.trim().toLowerCase())
  const errors: string[] = []
  let imported = 0
  let skipped = 0

  for (let i = 1; i < lines.length; i++) {
    // Skip blank lines
    if (!lines[i].trim()) continue

    const cols = lines[i].split(',').map(c => c.trim())
    try {
      const email = cols[header.indexOf('employee_email')]
      const leaveTypeName = cols[header.indexOf('leave_type')]
      const startDateStr = cols[header.indexOf('start_date')]
      const endDateStr = cols[header.indexOf('end_date')]
      const daysStr = cols[header.indexOf('days')]
      const yearStr = cols[header.indexOf('year')]

      if (!email || !leaveTypeName || !startDateStr || !endDateStr || !daysStr) {
        errors.push(`Row ${i + 1}: Missing required columns`)
        continue
      }

      const days = parseFloat(daysStr)
      if (isNaN(days) || days <= 0) {
        errors.push(`Row ${i + 1}: Invalid days value "${daysStr}"`)
        continue
      }

      // Look up user by email
      const user = await db.user.findUnique({ where: { email } })
      if (!user) {
        errors.push(`Row ${i + 1}: User ${email} not found`)
        continue
      }

      // Look up leave type (case-insensitive)
      const leaveType = await db.leaveType.findFirst({
        where: { name: { equals: leaveTypeName, mode: 'insensitive' } },
      })
      if (!leaveType) {
        errors.push(`Row ${i + 1}: Leave type "${leaveTypeName}" not found`)
        continue
      }

      const startDate = new Date(startDateStr)
      const endDate = new Date(endDateStr)

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        errors.push(`Row ${i + 1}: Invalid date format`)
        continue
      }

      const year = yearStr ? (parseInt(yearStr) || startDate.getFullYear()) : startDate.getFullYear()

      // Idempotency check: skip if a request with the same key fields already exists
      const existing = await db.leaveRequest.findFirst({
        where: {
          userId: user.id,
          leaveTypeId: leaveType.id,
          startDate,
          endDate,
        },
      })
      if (existing) {
        skipped++
        continue
      }

      // Create as APPROVED historical record and increment used balance — atomically
      await db.$transaction([
        db.leaveRequest.create({
          data: {
            userId: user.id,
            leaveTypeId: leaveType.id,
            startDate,
            endDate,
            halfDay: 'NONE',
            daysCount: days,
            status: 'APPROVED',
            approvedAt: new Date(),
            reason: 'Historical import from OmniHR',
          },
        }),
        db.leaveBalance.upsert({
          where: {
            userId_leaveTypeId_year: {
              userId: user.id,
              leaveTypeId: leaveType.id,
              year,
            },
          },
          create: {
            userId: user.id,
            leaveTypeId: leaveType.id,
            year,
            entitlement: 0,
            used: days,
          },
          update: { used: { increment: days } },
        }),
      ])

      imported++
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  return {
    imported,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  }
}
