import { requireCapability } from '@/lib/dal'
import { db } from '@/lib/db'
import { AddEmployeeForm } from '@/components/people/AddEmployeeForm'

export default async function NewPersonPage() {
  await requireCapability('people.write')

  const managers = await db.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, position: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Add Employee</h1>
        <p className="text-muted-foreground">
          Add a new employee or contractor to your organization
        </p>
      </div>
      <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-6">
        <AddEmployeeForm managers={managers} />
      </div>
    </div>
  )
}
