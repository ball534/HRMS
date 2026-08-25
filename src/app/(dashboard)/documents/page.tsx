import { verifySession } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { db } from '@/lib/db'
import { DocumentsClient } from './DocumentsClient'

export default async function DocumentsPage() {
  const session = await verifySession()
  const isHR = can(session.role, 'documents.admin')

  let employees: { id: string; firstName: string; lastName: string }[] = []
  if (isHR) {
    employees = await db.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })
  }

  return (
    <DocumentsClient
      role={session.role}
      userId={session.userId}
      employees={employees}
    />
  )
}
