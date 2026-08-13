import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/dal'
import { getLetterDetail, getActiveOfficers } from '@/actions/letters'
import { LetterWorkspace } from '@/components/letters/LetterWorkspace'

type Props = { params: Promise<{ id: string }> }

export default async function LetterDetailPage({ params }: Props) {
  const { id } = await params
  const session = await requireCapability('letters.read')
  const [letter, officers] = await Promise.all([getLetterDetail(id), getActiveOfficers().catch(() => [])])

  if (!letter) notFound()

  const serialized = {
    id: letter.id,
    type: letter.type as 'EMPLOYMENT' | 'CONFIRMATION',
    status: letter.status as string,
    employeeName: `${letter.employee.firstName} ${letter.employee.lastName}`,
    approvingOfficer: letter.approvingOfficer
      ? { id: letter.approvingOfficer.id, firstName: letter.approvingOfficer.firstName, lastName: letter.approvingOfficer.lastName }
      : null,
    reviewedByName: letter.reviewedBy ? `${letter.reviewedBy.firstName} ${letter.reviewedBy.lastName}` : null,
    driveFileId: letter.driveFileId,
    driveWebViewLink: letter.driveWebViewLink,
    dueDate: letter.dueDate?.toISOString() ?? null,
    overdue: letter.overdue,
    rejectionReason: letter.rejectionReason,
    signedAt: letter.signedAt?.toISOString() ?? null,
    sentAt: letter.sentAt?.toISOString() ?? null,
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/letters" className="text-sm text-primary hover:underline">
          ← Back to letters
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          {serialized.type === 'EMPLOYMENT' ? 'Employment letter' : 'Confirmation letter'}
        </h1>
        <p className="text-muted-foreground">{serialized.employeeName}</p>
      </div>

      <LetterWorkspace
        letter={serialized}
        officers={officers}
        currentUserId={session.userId}
        currentRole={session.role}
      />
    </div>
  )
}
