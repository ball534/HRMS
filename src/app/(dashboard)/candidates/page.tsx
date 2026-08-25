import Link from 'next/link'
import { requireCapability } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { db } from '@/lib/db'
import { listCandidates, candidateCounts } from '@/actions/candidates'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'NEW', label: 'New' },
  { key: 'FOR_INTERVIEW', label: 'For interview' },
  { key: 'PASSED', label: 'Hired' },
  { key: 'ARCHIVED', label: 'Archived' },
] as const

const CITIZENSHIP_LABEL: Record<string, string> = {
  SG_CITIZEN: 'SG Citizen',
  SG_PR: 'SG PR',
  FOREIGNER: 'Foreigner',
}

const WANTED_LABEL: Record<string, string> = {
  EMPLOYEE: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACTOR: 'Contract',
}

function fmt(d: Date | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

type Props = { searchParams: Promise<{ status?: string }> }

export default async function CandidatesPage({ searchParams }: Props) {
  const session = await requireCapability('candidates.read')
  const { status } = await searchParams
  const active = TABS.find(t => t.key === status)?.key ?? 'NEW'

  // A manager sees only their own department's applications (the scoping lives
  // in the actions), so say so rather than letting an empty list look broken.
  const seesEveryone = can(session.role, 'people.read.directory')
  const me = seesEveryone
    ? null
    : await db.user.findUnique({
        where: { id: session.userId },
        select: { department: true },
      })

  const [candidates, counts] = await Promise.all([listCandidates(active), candidateCounts()])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Candidates</h1>
          <p className="text-muted-foreground">
            {seesEveryone
              ? 'Applications from the public form, from arrival through to their first day.'
              : me?.department
                ? `Applications for ${me.department}. You can interview and record the outcome; HR completes the hire.`
                : 'You have no department set, so there is nothing to show. Ask HR to set it on your record.'}
          </p>
        </div>
        {seesEveryone && (
          <Link
            href="/apply"
            target="_blank"
            className="shrink-0 text-sm text-primary hover:underline"
          >
            View the public form →
          </Link>
        )}
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map(tab => (
          <Link
            key={tab.key}
            href={`/candidates?status=${tab.key}`}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              tab.key === active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-muted-foreground">{counts[tab.key] ?? 0}</span>
          </Link>
        ))}
      </nav>

      {candidates.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
          Nothing here.
        </p>
      ) : (
        <section className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-3 font-medium">Applicant</th>
                <th className="px-6 py-3 font-medium">Applied for</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Available</th>
                <th className="px-6 py-3 font-medium">Received</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {candidates.map(c => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3">
                    <div className="font-medium">
                      {c.firstName} {c.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">{c.email}</div>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {c.positionApplied ?? '—'}
                    <div className="text-xs">
                      {[c.department, c.employmentTypeWanted ? WANTED_LABEL[c.employmentTypeWanted] : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {CITIZENSHIP_LABEL[c.citizenship] ?? c.citizenship}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">{fmt(c.earliestStartDate)}</td>
                  <td className="px-6 py-3 text-muted-foreground">{fmt(c.createdAt)}</td>
                  <td className="px-6 py-3 text-right">
                    <Link
                      href={`/candidates/${c.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
