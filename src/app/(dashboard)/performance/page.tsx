import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'

export default async function PerformanceLandingPage() {
  const session = await verifySession()

  // Route by role
  if (session.role === 'ADMIN') {
    redirect('/performance/cycles')
  }

  // Managers see their team queue; if they have no direct reports the
  // page itself shows the empty state.
  if (session.role === 'MANAGER') {
    redirect('/performance/team')
  }

  // Everyone else: their own reviews
  redirect('/performance/me')
}
