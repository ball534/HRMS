import { verifySession } from '@/lib/dal'
import { db } from '@/lib/db'
import { OrgChart, type OrgNode } from '@/components/people/OrgChart'

export default async function OrgChartPage() {
  await verifySession()

  const users = await db.user.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      position: true,
      department: true,
      country: true,
      reportingManagerId: true,
      _count: { select: { directReports: true } },
    },
    orderBy: { firstName: 'asc' },
  })

  const data: OrgNode[] = users.map((u) => ({
    id: u.id,
    name: `${u.firstName} ${u.lastName}`,
    title: u.position ?? '',
    location: u.country,
    department: u.department ?? '',
    parentId: u.reportingManagerId,
    directReportCount: u._count.directReports,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Org Chart</h1>
        <p className="text-muted-foreground">Visual hierarchy of your organization</p>
      </div>
      <OrgChart data={data} />
    </div>
  )
}
