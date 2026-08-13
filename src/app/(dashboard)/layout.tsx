import { SidebarProvider } from '@/components/ui/sidebar'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { verifySession } from '@/lib/dal'
import { db } from '@/lib/db'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await verifySession()
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { firstName: true, lastName: true, email: true, employmentType: true },
  })
  const directReportsCount = await db.user.count({
    where: { reportingManagerId: session.userId, status: 'ACTIVE' },
  })
  const unreadCount = await db.notification.count({
    where: { userId: session.userId, readAt: null },
  })

  const name = user ? `${user.firstName} ${user.lastName}` : 'User'
  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : 'U'

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar
          role={session.role}
          userId={session.userId}
          isPartTime={user?.employmentType === 'PART_TIME'}
          hasDirectReports={directReportsCount > 0}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar user={{ name, email: user?.email ?? '', initials }} unreadCount={unreadCount} />
          <main className="flex-1 overflow-y-auto p-5 md:p-8">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  )
}
