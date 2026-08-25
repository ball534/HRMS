import Link from 'next/link'
import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { getLetterDetail, getActiveOfficers } from '@/actions/letters'
import { parseSections, LETTER_KINDS, LETTER_KIND_LABELS } from '@/lib/letterSections'
import { LetterWorkspace } from '@/components/letters/LetterWorkspace'

type Props = { params: Promise<{ id: string }> }

export default async function LetterDetailPage({ params }: Props) {
  const { id } = await params
  const session = await verifySession()

  // getLetterDetail authorizes: HR, the assigned signatory, or the employee
  // themselves. It throws for anyone else rather than returning a letter.
  let letter: Awaited<ReturnType<typeof getLetterDetail>>
  try {
    letter = await getLetterDetail(id)
  } catch {
    notFound()
  }
  if (!letter) notFound()

  const isHr = can(session.role, 'letters.write')
  const officers = isHr ? await getActiveOfficers().catch(() => []) : []

  const serialized = {
    id: letter.id,
    type: letter.type as 'EMPLOYMENT' | 'CONFIRMATION',
    kind: letter.kind as string | null,
    status: letter.status as string,
    employeeName: `${letter.employee.firstName} ${letter.employee.lastName}`,
    employeeId: letter.employeeId,
    sections: parseSections(letter.sections),
    approvingOfficer: letter.approvingOfficer
      ? {
          id: letter.approvingOfficer.id,
          firstName: letter.approvingOfficer.firstName,
          lastName: letter.approvingOfficer.lastName,
        }
      : null,
    reviewedByName: letter.reviewedBy
      ? `${letter.reviewedBy.firstName} ${letter.reviewedBy.lastName}`
      : null,
    blobId: letter.blobId,
    dueDate: letter.dueDate?.toISOString() ?? null,
    overdue: letter.overdue,
    rejectionReason: letter.rejectionReason,
    declineReason: letter.employeeDeclineReason,
    signedAt: letter.signedAt?.toISOString() ?? null,
    sentAt: letter.sentAt?.toISOString() ?? null,
    acceptedAt: letter.employeeAcceptedAt?.toISOString() ?? null,
    declinedAt: letter.employeeDeclinedAt?.toISOString() ?? null,
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/letters" className="text-sm text-primary hover:underline">
          ← Back to letters
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          {serialized.type === 'EMPLOYMENT' ? 'Employment letter' : 'Confirmation letter'}
        </h1>
        <p className="text-muted-foreground">
          {serialized.employeeName}
          {letter.employee.department ? ` · ${letter.employee.department}` : ''}
        </p>
      </div>

      <LetterWorkspace
        letter={serialized}
        officers={officers}
        kindOptions={LETTER_KINDS.map(k => ({ value: k, label: LETTER_KIND_LABELS[k] }))}
        currentUserId={session.userId}
        canEdit={isHr}
      />
    </div>
  )
}
