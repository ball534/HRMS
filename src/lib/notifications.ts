import 'server-only'

import { sendEmail } from '@/lib/email'
import { sendLarkMessage, isLarkConfigured } from '@/lib/lark'

// ============================================================
// Notification facade. One place the HR flows + cron call, so the channel
// (email today, Lark later) can change behind a stable interface.
//
//  - HR reminders  -> email (Resend), best-effort (never throws).
//  - Letter delivery -> Lark when configured, else email fallback.
// ============================================================

export type Recipient = { email: string; name?: string | null; larkUserId?: string | null }

export async function sendHrReminder(opts: {
  to: Recipient
  subject: string
  bodyHtml: string
}): Promise<{ ok: boolean }> {
  try {
    await sendEmail({ to: opts.to.email, subject: opts.subject, html: opts.bodyHtml })
    return { ok: true }
  } catch (err) {
    console.error('[notify] HR reminder failed:', err)
    return { ok: false }
  }
}

export async function deliverLetter(opts: {
  to: Recipient
  subject: string
  bodyHtml: string
  attachment?: { fileName: string; buffer: Buffer }
}): Promise<{ channel: 'lark' | 'email' | 'failed' }> {
  if (isLarkConfigured()) {
    const res = await sendLarkMessage({
      to: { email: opts.to.email, larkUserId: opts.to.larkUserId ?? undefined },
      subject: opts.subject,
      body: stripHtml(opts.bodyHtml),
      attachment: opts.attachment,
    })
    if (res.ok && !res.stubbed) return { channel: 'lark' }
    // configured-but-stubbed or failed -> fall through to email
  }

  try {
    await sendEmail({
      to: opts.to.email,
      subject: opts.subject,
      html: opts.bodyHtml,
      attachments: opts.attachment
        ? [{ filename: opts.attachment.fileName, content: opts.attachment.buffer }]
        : undefined,
    })
    return { channel: 'email' }
  } catch (err) {
    console.error('[notify] letter delivery failed:', err)
    return { channel: 'failed' }
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
