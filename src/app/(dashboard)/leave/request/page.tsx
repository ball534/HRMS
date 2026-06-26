import { verifySession } from '@/lib/dal'
import { db } from '@/lib/db'
import { LeaveRequestForm } from '@/components/leave/LeaveRequestForm'

export default async function RequestLeavePage() {
  await verifySession()

  const leaveTypes = await db.leaveType.findMany({
    where: { applicableToAll: true },
    select: {
      id: true,
      name: true,
      requiresAttachment: true,
      allowsHalfDay: true,
      defaultEntitlement: true,
    },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Request Time Off</h1>
        <p className="text-muted-foreground">Submit a new leave request</p>
      </div>

      <div className="mx-auto max-w-xl rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <LeaveRequestForm leaveTypes={leaveTypes} />
      </div>
    </div>
  )
}
