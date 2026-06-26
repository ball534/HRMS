import { verifySession } from '@/lib/dal'
import { PeopleTable } from '@/components/people/PeopleTable'

export default async function PeoplePage() {
  const session = await verifySession()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">People</h1>
        <p className="text-muted-foreground">Manage your team members and contractors</p>
      </div>
      <PeopleTable userRole={session.role} />
    </div>
  )
}
