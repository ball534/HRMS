import { verifySession } from '@/lib/dal'
import { db } from '@/lib/db'
import { PerformanceTabs } from '@/components/performance/PerformanceTabs'

export default async function PerformanceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await verifySession()
  const isAdmin = session.role === 'ADMIN'
  const directReportsCount = await db.user.count({
    where: { reportingManagerId: session.userId, status: 'ACTIVE' },
  })
  const hasTeam = directReportsCount > 0

  return (
    <div className="space-y-5">
      <PerformanceTabs isAdmin={isAdmin} hasTeam={hasTeam} />
      {children}
    </div>
  )
}
