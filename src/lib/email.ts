import { Resend } from 'resend'

// Lazy-init so a missing RESEND_API_KEY doesn't crash at import time.
// The app continues to work without email; only sends throw.
let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) {
      throw new Error(
        'RESEND_API_KEY is not set. Email features (password reset) are disabled until it is.',
      )
    }
    _resend = new Resend(key)
  }
  return _resend
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'InsideHR <noreply@insidehr.com>'

/**
 * Generic email sender used by the notification adapter (reminders + letter
 * delivery fallback). Throws if RESEND_API_KEY is not configured — callers
 * that must not fail (cron reminders) should catch.
 */
export async function sendEmail(opts: {
  to: string | string[]
  subject: string
  html: string
  attachments?: { filename: string; content: Buffer }[]
}) {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    attachments: opts.attachments,
  })
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
) {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: 'Reset your InsideHR password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Reset Your Password</h2>
        <p>We received a request to reset your InsideHR password. Click the button below to set a new password:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #6d28d9; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Reset Password
        </a>
        <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  })
}
