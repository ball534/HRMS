import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { can } from '@/lib/permissions'

export default async function PerformanceLandingPage() {
  const session = await verifySession()

  // Route by what the viewer can do
  if (can(session.role, 'performance.admin')) {
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
