import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { db } from '@/lib/db'
import { PeopleTable } from '@/components/people/PeopleTable'

/**
 * The employee directory.
 *
 * This was open to everyone with a login — names, emails, phone numbers and
 * reporting lines for the whole Group. It is now HR's screen, with one narrower
 * version of it: a manager sees the people in their own department, read-only.
 * (The `/api/users` route the table reads applies the same scoping, so the
 * restriction is not merely cosmetic.)
 */
export default async function PeoplePage() {
  const session = await verifySession()

  const seesEveryone = can(session.role, 'people.read.directory')
  const seesOwnDepartment = can(session.role, 'people.read.department')
  if (!seesEveryone && !seesOwnDepartment) redirect('/dashboard')

  const me = seesEveryone
    ? null
    : await db.user.findUnique({
        where: { id: session.userId },
        select: { department: true },
      })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{seesEveryone ? 'People' : 'My Department'}</h1>
        <p className="text-muted-foreground">
          {seesEveryone
            ? 'Manage your team members and contractors'
            : me?.department
              ? `Everyone in ${me.department}. You can see their details but not change them.`
              : 'You have no department set, so there is nobody to show. Ask HR to set it on your record.'}
        </p>
      </div>
      <PeopleTable userRole={session.role} />
    </div>
  )
}
