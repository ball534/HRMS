import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/session'

/**
 * Routes reachable without a session.
 *
 * `/apply` is the job-application form: the people filling it in have no
 * account, and most of them never will. It creates a Candidate, not a User.
 */
const PUBLIC_ROUTES = ['/login', '/apply']
const CHANGE_PASSWORD_ROUTE = '/change-password'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname)

  // Get session cookie
  const sessionCookie = request.cookies.get('session')
  const session = sessionCookie?.value
    ? await decrypt(sessionCookie.value)
    : null

  // No valid session
  if (!session) {
    if (isPublicRoute) {
      // Allow access to public routes (login page)
      return NextResponse.next()
    }
    // Redirect unauthenticated users to login
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Valid session exists
  if (pathname === '/login') {
    // Redirect authenticated users away from login
    const dashboardUrl = new URL('/dashboard', request.url)
    return NextResponse.redirect(dashboardUrl)
  }

  // Force password change: redirect to /change-password if required
  if (session.mustChangePassword && pathname !== CHANGE_PASSWORD_ROUTE) {
    const changePasswordUrl = new URL(CHANGE_PASSWORD_ROUTE, request.url)
    return NextResponse.redirect(changePasswordUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
}
