import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { can, type Capability } from '@/lib/permissions'

/**
 * The Data Access Layer — the single auth boundary.
 *
 * `verifySession` re-reads the user from the database on every request rather
 * than trusting the JWT claims. That costs one indexed lookup (deduped per
 * request by React's `cache`) and buys three things the stateless token could
 * not give us:
 *
 *   1. Termination takes effect immediately. The session cookie is a 7-day
 *      JWT with no server-side record, so before this a terminated employee —
 *      including a terminated ADMIN — kept full access for up to a week after
 *      their last day.
 *   2. Role changes take effect immediately. Demoting someone used to leave
 *      their old role baked into their token until it expired.
 *   3. `mustChangePassword` can't be dodged by holding on to a token minted
 *      before the flag was set.
 *
 * A session whose user is gone or no longer ACTIVE is sent to
 * `/api/auth/revoked`, which clears the cookie and returns them to the login
 * page. (We can't clear a cookie from inside a Server Component render, which
 * is why this is a redirect to a route handler rather than a `deleteSession`
 * call here.)
 */

export type VerifiedSession = {
  isAuth: boolean
  userId: string
  role: string
  mustChangePassword: boolean
}

/** Route handler that clears the dead cookie and bounces to login. */
const REVOKED_ROUTE = '/api/auth/revoked'

export const verifySession = cache(async (): Promise<VerifiedSession> => {
  const session = await getSession()

  if (!session || !session.userId) {
    redirect('/login')
  }

  // Authoritative check against the database — see the note above.
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, status: true, mustChangePassword: true },
  })

  // The account was hard-deleted while the token was still valid.
  if (!user) {
    redirect(REVOKED_ROUTE)
  }

  // Terminated, deactivated, or a rejected candidate — access ends now, not
  // when the token happens to expire.
  if (user.status !== 'ACTIVE') {
    redirect(REVOKED_ROUTE)
  }

  return {
    isAuth: true,
    userId: user.id,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  }
})

/**
 * Capability gate for pages and server actions. Redirects to the dashboard
 * when the caller's role doesn't hold `capability`.
 */
export async function requireCapability(capability: Capability): Promise<VerifiedSession> {
  const session = await verifySession()

  if (!can(session.role, capability)) {
    redirect('/dashboard')
  }

  return session
}

// ============================================================
// API / export routes
//
// Route handlers must not use the redirecting helpers above: a fetch for JSON
// or an XLSX file that hits `redirect('/dashboard')` gets a 307 and a page of
// HTML, which surfaces to the caller as a parse error rather than "you're not
// allowed". These variants throw `HttpAuthError` so the handler can return a
// real 401/403.
// ============================================================

export class HttpAuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message)
    this.name = 'HttpAuthError'
  }

  toResponse(): NextResponse {
    return NextResponse.json({ error: this.message }, { status: this.status })
  }
}

/** Session check for route handlers. Throws `HttpAuthError` (401) when absent. */
export async function verifySessionApi(): Promise<VerifiedSession> {
  const session = await getSession()
  if (!session?.userId) {
    throw new HttpAuthError(401, 'Not authenticated')
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, status: true, mustChangePassword: true },
  })

  if (!user || user.status !== 'ACTIVE') {
    throw new HttpAuthError(401, 'Session is no longer valid')
  }

  return {
    isAuth: true,
    userId: user.id,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  }
}

/** Capability check for route handlers. Throws `HttpAuthError` (401/403). */
export async function requireCapabilityApi(capability: Capability): Promise<VerifiedSession> {
  const session = await verifySessionApi()

  if (!can(session.role, capability)) {
    throw new HttpAuthError(403, 'You do not have permission to access this resource')
  }

  return session
}

/**
 * Wraps a route handler body so an `HttpAuthError` becomes the right status
 * code instead of a 500.
 *
 *   export async function GET() {
 *     return withApiAuth(async () => {
 *       const session = await requireCapabilityApi('payroll.export')
 *       ...
 *     })
 *   }
 */
export async function withApiAuth(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler()
  } catch (err) {
    if (err instanceof HttpAuthError) return err.toResponse()
    throw err
  }
}
