import { NextRequest, NextResponse } from 'next/server'

/**
 * Clears a session that the DAL has determined is no longer valid — the user
 * was terminated, deactivated, or hard-deleted while their 7-day JWT was
 * still cryptographically fine.
 *
 * This exists as a route handler rather than living inside `verifySession`
 * because a Server Component render cannot mutate cookies. `verifySession`
 * redirects here; here we can actually delete the cookie and send the person
 * to the login page with an explanation.
 */
export async function GET(request: NextRequest) {
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('reason', 'session_revoked')

  const response = NextResponse.redirect(loginUrl)

  // Expire the cookie on the way out. Attributes must match how it was set
  // in src/lib/session.ts or the browser keeps the original.
  response.cookies.set('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })

  return response
}
