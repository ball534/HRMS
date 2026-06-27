import 'server-only'

// ============================================================
// Lark notification adapter — DRAFT / INFRASTRUCTURE ONLY
//
// The doc calls for confirmation letters (and potentially reminders) to be
// delivered through Lark. This module is the pluggable seam for that: a single
// sendLarkMessage() the rest of the app calls. It is intentionally a rough
// scaffold, not a finished integration.
//
// To finish the real integration you need:
//   1. A Lark custom app: LARK_APP_ID + LARK_APP_SECRET.
//   2. A tenant_access_token exchange (POST /open-apis/auth/v3/...).
//   3. A way to map an HRMS user -> Lark open_id/user_id (e.g. by email via
//      /open-apis/contact/v3/users/batch_get_id), stored on the User.
//   4. Message send (/open-apis/im/v1/messages) and, for the PDF, a file
//      upload (/open-apis/im/v1/files) then a file message.
//
// Until LARK_APP_ID/SECRET are set, sends are stubbed (logged) and callers
// fall back to email (see notifications.ts).
// ============================================================

type LarkRecipient = { email: string; larkUserId?: string }

export type LarkMessage = {
  to: LarkRecipient
  subject: string
  body: string
  attachment?: { fileName: string; buffer: Buffer }
}

export type LarkSendResult = { ok: boolean; stubbed: boolean }

const LARK_BASE = process.env.LARK_BASE_URL || 'https://open.larksuite.com'

export function isLarkConfigured(): boolean {
  return Boolean(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET)
}

export async function sendLarkMessage(msg: LarkMessage): Promise<LarkSendResult> {
  if (!isLarkConfigured()) {
    console.info('[lark:stub] would deliver via Lark', {
      to: msg.to.email,
      subject: msg.subject,
      hasAttachment: Boolean(msg.attachment),
    })
    return { ok: true, stubbed: true }
  }

  // --- Scaffold for the real call path (not yet wired end-to-end) ---
  try {
    const token = await getTenantAccessToken()
    const openId = await resolveOpenId(token, msg.to)
    if (!openId) {
      console.warn('[lark] could not resolve recipient open_id', msg.to.email)
      return { ok: false, stubbed: true }
    }
    // TODO: POST ${LARK_BASE}/open-apis/im/v1/messages with the resolved openId.
    //       For attachments, first upload via /open-apis/im/v1/files.
    console.warn('[lark] message send not implemented; treating as stubbed', {
      to: openId,
      subject: msg.subject,
    })
    return { ok: true, stubbed: true }
  } catch (err) {
    console.error('[lark] send failed:', err)
    return { ok: false, stubbed: true }
  }
}

/**
 * Exchange app credentials for a tenant access token.
 * Scaffolded; returns the token on success or throws.
 */
async function getTenantAccessToken(): Promise<string> {
  const res = await fetch(`${LARK_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.LARK_APP_ID,
      app_secret: process.env.LARK_APP_SECRET,
    }),
  })
  const data = (await res.json()) as { code?: number; tenant_access_token?: string; msg?: string }
  if (!data.tenant_access_token) {
    throw new Error(`Lark token exchange failed: ${data.msg ?? 'unknown error'}`)
  }
  return data.tenant_access_token
}

/**
 * Resolve a recipient's Lark open_id. Prefers an explicit larkUserId; otherwise
 * would look it up by email. Scaffolded — returns the explicit id or null.
 */
async function resolveOpenId(_token: string, to: LarkRecipient): Promise<string | null> {
  if (to.larkUserId) return to.larkUserId
  // TODO: POST /open-apis/contact/v3/users/batch_get_id { emails: [to.email] }
  return null
}
