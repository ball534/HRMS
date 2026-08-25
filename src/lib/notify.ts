import 'server-only'

import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { getSetting } from '@/lib/settings'
import type { NotificationType } from '@/generated/prisma/client'

/**
 * The notification layer.
 *
 * Nothing in this app used to tell anyone anything. Leave was approved,
 * timesheets were rejected, expenses were reimbursed, tests locked people out
 * of their onboarding — and the only way to find out was to happen to log in
 * and look. The daily cron covered three HR reminders and nothing else.
 *
 * `notify()` is the single call every lifecycle event makes. It always writes
 * an in-app row (so there is a durable record that the person was told, and
 * something for the header inbox to show), and then tries email as a secondary
 * channel.
 *
 * Two rules:
 *
 *   1. It never throws. A notification failing must not roll back the leave
 *      approval that triggered it. Failures are logged and, for email,
 *      recorded on the notification row itself in `emailError`.
 *   2. Callers pass a `linkUrl` so the notification is actionable — landing on
 *      the record beats landing on the dashboard.
 */

export type NotifyInput = {
  userId: string
  type: NotificationType
  title: string
  /** Plain text. Rendered as-is in the inbox and wrapped in a <p> for email. */
  body: string
  /** App-relative path to the record this concerns, e.g. `/leave/abc123`. */
  linkUrl?: string
  /**
   * Force email on/off for this notification. Defaults to the
   * `notify.emailEnabled` org setting.
   */
  email?: boolean
}

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''

function emailHtml(opts: { title: string; body: string; linkUrl?: string }): string {
  const link = opts.linkUrl
    ? `<p style="margin-top:16px"><a href="${APP_URL}${opts.linkUrl}">Open in InsideHR</a></p>`
    : ''
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.5">
  <p style="font-weight:600;margin:0 0 8px">${escapeHtml(opts.title)}</p>
  <p style="margin:0">${escapeHtml(opts.body)}</p>
  ${link}
  <p style="margin-top:24px;color:#6b7280;font-size:12px">You are receiving this because of an action in InsideHR.</p>
</div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Notify one person. Best-effort: never throws, so callers don't need a
 * try/catch around it.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const recipient = await db.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, status: true },
    })

    // Don't queue notifications for someone who has left — their offboarding
    // re-routed anything that still needs doing to a live person.
    if (!recipient || recipient.status !== 'ACTIVE') return

    const row = await db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        linkUrl: input.linkUrl,
      },
      select: { id: true },
    })

    const emailEnabled = input.email ?? (await getSetting('notify.emailEnabled'))
    if (!emailEnabled || !recipient.email) return

    try {
      await sendEmail({
        to: recipient.email,
        subject: input.title,
        html: emailHtml(input),
      })
      await db.notification.update({
        where: { id: row.id },
        data: { emailedAt: new Date() },
      })
    } catch (err) {
      // Recorded on the row rather than only in the server log, so "was this
      // person actually emailed?" is answerable from the data.
      const message = err instanceof Error ? err.message : String(err)
      console.error('[notify] email failed:', message)
      await db.notification
        .update({ where: { id: row.id }, data: { emailError: message.slice(0, 500) } })
        .catch(() => {})
    }
  } catch (err) {
    console.error('[notify] failed to create notification:', err)
  }
}

/** Notify several people with the same message. Duplicate ids are collapsed. */
export async function notifyMany(
  userIds: (string | null | undefined)[],
  input: Omit<NotifyInput, 'userId'>,
): Promise<void> {
  const unique = Array.from(new Set(userIds.filter((id): id is string => !!id)))
  await Promise.all(unique.map(userId => notify({ ...input, userId })))
}

/**
 * Notify everyone holding an HR-ish role. Used where the audience is "whoever
 * is on the HR desk" rather than a specific person — before this, reminders
 * went to whichever HR user the database happened to return first, so if that
 * person was on leave or had left, nobody was told at all.
 */
export async function notifyHr(input: Omit<NotifyInput, 'userId'>): Promise<void> {
  const hr = await db.user.findMany({
    where: { status: 'ACTIVE', role: 'HR' },
    select: { id: true },
  })
  await notifyMany(
    hr.map(h => h.id),
    input,
  )
}
