import 'server-only'

import { db } from '@/lib/db'
import { sendHrReminder } from '@/lib/notifications'
import { sendEmail } from '@/lib/email'
import { sendLetterToEmployee } from '@/actions/letters'
import { findWorkPassesDueForReminder } from '@/lib/workPasses'
import { createAuditLog } from '@/lib/audit'

// ============================================================
// Daily reminder sweep — invoked by /api/cron/daily.
//
//  1. Probation: 2 weeks before probation end (no confirmation date yet) → HR.
//  2. Confirmation letters awaiting signature → nudge the officer every 2 days.
//  3. Signed confirmation letters whose due date has arrived → send to employee.
//  4. Confirmation letters past due but unsigned → flag overdue + tell HR.
//  5. Work passes hitting their (type-specific) reminder window → HR.
// ============================================================

const DAY = 1000 * 60 * 60 * 24
const PROBATION_REMINDER_DAYS = 14
const OFFICER_NUDGE_DAYS = 2

function startOfToday(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function daysUntil(date: Date): number {
  return Math.floor((new Date(date).setUTCHours(0, 0, 0, 0) - startOfToday().getTime()) / DAY)
}

function fmt(d: Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

async function getHrEmails(): Promise<string[]> {
  const hr = await db.user.findMany({
    where: { role: { in: ['HR', 'ADMIN'] }, status: 'ACTIVE' },
    select: { email: true },
  })
  return hr.map(h => h.email)
}

export type ReminderSummary = {
  probation: number
  officerNudges: number
  delivered: number
  overdue: number
  workPasses: number
  workPassesExpired: number
}

export async function runDailyReminders(): Promise<ReminderSummary> {
  const summary: ReminderSummary = { probation: 0, officerNudges: 0, delivered: 0, overdue: 0, workPasses: 0, workPassesExpired: 0 }
  const hrEmails = await getHrEmails()
  const today = startOfToday()

  // 1. Probation ending in ~2 weeks, confirmation date not yet entered.
  const probationDue = await db.user.findMany({
    where: { status: 'ACTIVE', confirmationDate: null, probationEndDate: { not: null } },
    select: { id: true, firstName: true, lastName: true, probationEndDate: true },
  })
  for (const u of probationDue) {
    if (u.probationEndDate && daysUntil(u.probationEndDate) === PROBATION_REMINDER_DAYS && hrEmails.length) {
      await sendHrReminder({
        to: { email: hrEmails[0] },
        subject: `Probation ending soon: ${u.firstName} ${u.lastName}`,
        bodyHtml: `<p>${u.firstName} ${u.lastName}'s probation ends on <strong>${fmt(u.probationEndDate)}</strong> (in ${PROBATION_REMINDER_DAYS} days).</p><p>Please enter a confirmation date to start the confirmation-letter flow.</p>`,
      })
      // copy the rest of HR
      if (hrEmails.length > 1) {
        await sendEmail({
          to: hrEmails.slice(1),
          subject: `Probation ending soon: ${u.firstName} ${u.lastName}`,
          html: `<p>${u.firstName} ${u.lastName}'s probation ends on <strong>${fmt(u.probationEndDate)}</strong>.</p>`,
        }).catch(() => {})
      }
      summary.probation++
    }
  }

  // 2. Confirmation letters awaiting signature → nudge the officer every 2 days.
  const awaitingSignature = await db.employmentLetter.findMany({
    where: { type: 'CONFIRMATION', status: 'PENDING_SIGNATURE', approvingOfficerId: { not: null } },
    include: { approvingOfficer: { select: { email: true, firstName: true } }, employee: { select: { firstName: true, lastName: true } } },
  })
  for (const letter of awaitingSignature) {
    const last = letter.lastReminderAt
    const due = !last || (today.getTime() - new Date(last).setUTCHours(0, 0, 0, 0)) >= OFFICER_NUDGE_DAYS * DAY
    if (!due || !letter.approvingOfficer) continue
    await sendHrReminder({
      to: { email: letter.approvingOfficer.email },
      subject: `Action needed: sign confirmation letter for ${letter.employee.firstName} ${letter.employee.lastName}`,
      bodyHtml: `<p>Hi ${letter.approvingOfficer.firstName},</p><p>The confirmation letter for ${letter.employee.firstName} ${letter.employee.lastName} is waiting for your signature${letter.dueDate ? ` (due ${fmt(letter.dueDate)})` : ''}.</p>`,
    })
    await db.employmentLetter.update({ where: { id: letter.id }, data: { lastReminderAt: new Date() } })
    await createAuditLog({
      userId: letter.employeeId,
      action: 'LETTER_REMINDER_SENT',
      entityType: 'EMPLOYMENT_LETTER',
      entityId: letter.id,
    })
    summary.officerNudges++
  }

  // 3. Signed confirmation letters whose due date has arrived → deliver.
  const readyToSend = await db.employmentLetter.findMany({
    where: { type: 'CONFIRMATION', status: 'SIGNED', sentAt: null, dueDate: { lte: today } },
    select: { id: true },
  })
  for (const letter of readyToSend) {
    const res = await sendLetterToEmployee(letter.id)
    if (res.success) summary.delivered++
  }

  // 4. Confirmation letters past due but still unsigned → flag overdue + tell HR.
  const overdue = await db.employmentLetter.findMany({
    where: {
      type: 'CONFIRMATION',
      status: { in: ['PENDING_REVIEW', 'PENDING_SIGNATURE'] },
      dueDate: { lt: today },
    },
    include: { employee: { select: { firstName: true, lastName: true } } },
  })
  for (const letter of overdue) {
    if (!letter.overdue) {
      await db.employmentLetter.update({ where: { id: letter.id }, data: { overdue: true } })
    }
    if (hrEmails.length) {
      await sendHrReminder({
        to: { email: hrEmails[0] },
        subject: `OVERDUE confirmation letter: ${letter.employee.firstName} ${letter.employee.lastName}`,
        bodyHtml: `<p>The confirmation letter for ${letter.employee.firstName} ${letter.employee.lastName} was due on <strong>${fmt(letter.dueDate)}</strong> but is not yet signed/sent.</p>`,
      })
    }
    summary.overdue++
  }

  // 5. Work passes entering their reminder window, and passes already expired.
  //
  // `due` now fires every day from the lead-day threshold onwards rather than
  // on the exact lead day only — a single missed cron run used to mean the
  // reminder never fired for that pass at all.
  const { due: passesDue, expired: passesExpired } = await findWorkPassesDueForReminder()

  for (const p of passesDue) {
    if (hrEmails.length) {
      await sendHrReminder({
        to: { email: hrEmails[0] },
        subject: `Work pass renewal due: ${p.user.firstName} ${p.user.lastName}`,
        bodyHtml: `<p>${p.user.firstName} ${p.user.lastName}'s ${p.passType} expires on <strong>${fmt(p.expiryDate)}</strong>. Begin the renewal/review process.</p>`,
      })
      if (hrEmails.length > 1) {
        await sendEmail({
          to: hrEmails.slice(1),
          subject: `Work pass renewal due: ${p.user.firstName} ${p.user.lastName}`,
          html: `<p>${p.user.firstName} ${p.user.lastName}'s ${p.passType} expires on <strong>${fmt(p.expiryDate)}</strong>.</p>`,
        }).catch(() => {})
      }
    }
    summary.workPasses++
  }

  // An expired pass means someone may be working without valid authorisation —
  // a direct MOM/immigration exposure. This escalates to the whole HR group
  // every day until the pass record is updated, rather than being silently
  // dropped as it was before.
  for (const p of passesExpired) {
    if (hrEmails.length) {
      await sendEmail({
        to: hrEmails,
        subject: `EXPIRED work pass: ${p.user.firstName} ${p.user.lastName}`,
        html: `<p><strong>${p.user.firstName} ${p.user.lastName}</strong>'s ${p.passType} expired on <strong>${fmt(p.expiryDate)}</strong> and has not been renewed in the system.</p><p>If they are still working, this is an immigration compliance exposure. Verify the pass status and update the record.</p>`,
      }).catch(() => {})
    }
    summary.workPassesExpired++
  }

  return summary
}
