import { verifySession } from '@/lib/dal'
import { db } from '@/lib/db'
import { TimeTabs } from '@/components/time/TimeTabs'

export default async function TimeLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession()
  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { employmentType: true },
  })
  const directReportsCount = await db.user.count({
    where: { reportingManagerId: session.userId, status: 'ACTIVE' },
  })

  return (
    <div className="space-y-5">
      <TimeTabs
        isPartTime={me?.employmentType === 'PART_TIME'}
        hasTeam={directReportsCount > 0}
        isAdmin={session.role === 'ADMIN'}
      />
      {children}
    </div>
  )
}
