import { verifySession } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { db } from '@/lib/db'
import { getMyOnboarding, listOnboardingSubmissions } from '@/actions/onboarding'
import { OnboardingForm } from '@/components/onboarding/OnboardingForm'
import { OnboardingTracker } from '@/components/onboarding/OnboardingTracker'

/**
 * Onboarding documents.
 *
 * One route, two audiences: the new hire fills the form in, and HR watches who
 * still hasn't. Someone who is both (an HR joiner) sees their own form first and
 * the tracker underneath.
 */
export default async function OnboardingPage() {
  const session = await verifySession()

  const [me, mine] = await Promise.all([
    db.user.findUnique({
      where: { id: session.userId },
      select: { firstName: true, citizenship: true },
    }),
    getMyOnboarding(),
  ])

  const isHr = can(session.role, 'documents.admin')
  const submissions = isHr ? await listOnboardingSubmissions() : []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Onboarding documents</h1>
        <p className="text-muted-foreground">
          {mine && !mine.submittedAt
            ? 'The last step before you can be added to payroll.'
            : 'What we need from a new hire once they have signed their letter.'}
        </p>
      </div>

      {mine ? (
        <OnboardingForm
          firstName={me?.firstName ?? ''}
          isPr={me?.citizenship === 'SG_PR'}
          submitted={
            mine.submittedAt
              ? {
                  at: mine.submittedAt.toISOString(),
                  bankName: mine.bankName,
                  bankAccountName: mine.bankAccountName,
                  prGrantDate: mine.prGrantDate?.toISOString() ?? null,
                  documents: [
                    { label: 'NRIC (front)', blobId: mine.nricFrontDoc?.blobId ?? null },
                    { label: 'NRIC (back)', blobId: mine.nricBackDoc?.blobId ?? null },
                    { label: 'Bank account details', blobId: mine.bankProofDoc?.blobId ?? null },
                    ...(mine.entryPermitDoc
                      ? [{ label: 'Entry permit', blobId: mine.entryPermitDoc.blobId }]
                      : []),
                  ],
                }
              : null
          }
        />
      ) : (
        !isHr && (
          <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
            There is nothing for you to send us. This page opens once you have signed your employment
            letter.
          </p>
        )
      )}

      {isHr && (
        <OnboardingTracker
          rows={submissions.map(s => ({
            id: s.id,
            userId: s.user.id,
            name: `${s.user.firstName} ${s.user.lastName}`,
            email: s.user.email,
            position: s.user.position,
            department: s.user.department,
            isPr: s.user.citizenship === 'SG_PR',
            startDate: s.user.startDate?.toISOString() ?? null,
            requestedAt: s.createdAt.toISOString(),
            submittedAt: s.submittedAt?.toISOString() ?? null,
            bankName: s.bankName,
            bankAccountName: s.bankAccountName,
            bankAccountNumber: s.bankAccountNumber,
            prGrantDate: s.prGrantDate?.toISOString() ?? null,
            documents: [
              { label: 'NRIC front', blobId: s.nricFrontDoc?.blobId ?? null },
              { label: 'NRIC back', blobId: s.nricBackDoc?.blobId ?? null },
              { label: 'Bank', blobId: s.bankProofDoc?.blobId ?? null },
              { label: 'Entry permit', blobId: s.entryPermitDoc?.blobId ?? null },
            ],
          }))}
        />
      )}
    </div>
  )
}
