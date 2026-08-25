import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { db } from '@/lib/db'
import { getCandidate } from '@/actions/candidates'
import { deriveLetterKind, LETTER_KINDS, LETTER_KIND_LABELS } from '@/lib/letterSections'
import { CandidateWorkspace } from '@/components/candidates/CandidateWorkspace'

type Props = { params: Promise<{ id: string }> }

export default async function CandidatePage({ params }: Props) {
  const { id } = await params
  const session = await requireCapability('candidates.read')
  const candidate = await getCandidate(id)
  if (!candidate) notFound()

  const managers = can(session.role, 'people.write')
    ? await db.user.findMany({
        where: { status: 'ACTIVE', role: { in: ['HR', 'MANAGER'] } },
        select: { id: true, firstName: true, lastName: true, position: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      })
    : []

  // What the letter would be drafted from, on what the application says. HR can
  // change it here or in the letter workspace afterwards.
  const suggestedKind = deriveLetterKind({
    employmentType: candidate.employmentTypeWanted ?? 'EMPLOYEE',
    department: candidate.department,
    position: candidate.positionApplied,
  })

  return (
    <div className="space-y-6">
      <div>
        <Link href="/candidates" className="text-sm text-primary hover:underline">
          ← Back to candidates
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          {candidate.firstName} {candidate.lastName}
        </h1>
        <p className="text-muted-foreground">
          Applied for {candidate.positionApplied ?? 'an unspecified role'}
          {candidate.department ? ` · ${candidate.department}` : ''}
        </p>
      </div>

      <CandidateWorkspace
        candidate={{
          id: candidate.id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone,
          dateOfBirth: candidate.dateOfBirth?.toISOString() ?? null,
          nationality: candidate.nationality,
          citizenship: candidate.citizenship,
          positionApplied: candidate.positionApplied,
          department: candidate.department,
          employmentTypeWanted: candidate.employmentTypeWanted,
          earliestStartDate: candidate.earliestStartDate?.toISOString() ?? null,
          resumeBlobId: candidate.resumeBlobId,
          resumeFileName: candidate.resumeFileName,
          status: candidate.status,
          notes: candidate.notes,
          decidedByName: candidate.decidedBy
            ? `${candidate.decidedBy.firstName} ${candidate.decidedBy.lastName}`
            : null,
          sentToInterviewAt: candidate.sentToInterviewAt?.toISOString() ?? null,
          decidedAt: candidate.decidedAt?.toISOString() ?? null,
          hiredUser: candidate.hiredUser,
          createdAt: candidate.createdAt.toISOString(),
        }}
        managers={managers}
        kindOptions={LETTER_KINDS.map(k => ({ value: k, label: LETTER_KIND_LABELS[k] }))}
        suggestedKind={suggestedKind}
        canHire={can(session.role, 'people.write') && can(session.role, 'candidates.write')}
      />
    </div>
  )
}
