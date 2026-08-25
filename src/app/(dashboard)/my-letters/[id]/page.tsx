import Link from 'next/link'
import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { getLetterDetail } from '@/actions/letters'
import { parseSections } from '@/lib/letterSections'
import { EmployeeLetterView } from '@/components/letters/EmployeeLetterView'

type Props = { params: Promise<{ id: string }> }

export default async function MyLetterPage({ params }: Props) {
  const { id } = await params
  const session = await verifySession()

  let letter: Awaited<ReturnType<typeof getLetterDetail>>
  try {
    letter = await getLetterDetail(id)
  } catch {
    notFound()
  }
  // Own letters only on this route — HR reads letters through /letters, and
  // landing here as somebody else would be confusing even where it is allowed.
  if (!letter || letter.employeeId !== session.userId) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/my-letters" className="text-sm text-primary hover:underline">
          ← Back to my letters
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          {letter.type === 'EMPLOYMENT' ? 'Employment letter' : 'Confirmation letter'}
        </h1>
        <p className="text-muted-foreground">
          {letter.employee.position ?? ''}
          {letter.employee.department ? ` · ${letter.employee.department}` : ''}
        </p>
      </div>

      <EmployeeLetterView
        letter={{
          id: letter.id,
          type: letter.type as 'EMPLOYMENT' | 'CONFIRMATION',
          status: letter.status as string,
          blobId: letter.blobId,
          sections: parseSections(letter.sections),
          signatoryName: letter.approvingOfficer
            ? `${letter.approvingOfficer.firstName} ${letter.approvingOfficer.lastName}`
            : null,
          acceptedAt: letter.employeeAcceptedAt?.toISOString() ?? null,
          declinedAt: letter.employeeDeclinedAt?.toISOString() ?? null,
          declineReason: letter.employeeDeclineReason,
        }}
      />
    </div>
  )
}
