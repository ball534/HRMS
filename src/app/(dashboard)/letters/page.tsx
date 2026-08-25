import Link from 'next/link'
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { getLettersToReview, getLettersAwaitingMySignature } from '@/actions/letters'
import { LETTER_KIND_LABELS, type LetterKindName } from '@/lib/letterSections'
import { cn } from '@/lib/utils'

const STATUS_STYLE: Record<string, string> = {
  PENDING_REVIEW: 'bg-amber-50 border-amber-200 text-amber-700',
  PENDING_SIGNATURE: 'bg-blue-50 border-blue-200 text-blue-700',
  SIGNED: 'bg-teal-50 border-teal-200 text-teal-700',
  SENT: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  ACCEPTED: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  DECLINED: 'bg-rose-50 border-rose-200 text-rose-700',
  OVERDUE: 'bg-rose-50 border-rose-200 text-rose-700',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: 'Pending review',
  PENDING_SIGNATURE: 'Awaiting signature',
  SIGNED: 'Signed',
  SENT: 'With the employee',
  ACCEPTED: 'Signed by employee',
  DECLINED: 'Declined by employee',
  OVERDUE: 'Overdue',
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

/**
 * The letters screen serves two audiences: HR, who see the whole queue, and a
 * signatory, who sees only the letters waiting on their own signature. A
 * manager who is nobody's signatory has no business here at all.
 */
export default async function LettersPage() {
  const session = await verifySession()
  const isHr = can(session.role, 'letters.read')

  const mine = await getLettersAwaitingMySignature(session.userId)
  if (!isHr && mine.length === 0) redirect('/dashboard')

  const letters = isHr ? await getLettersToReview() : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Letters</h1>
        <p className="text-muted-foreground">
          {isHr
            ? 'Employment and confirmation letters, from draft through to the employee’s signature.'
            : 'Letters waiting for your signature.'}
        </p>
      </div>

      {mine.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-blue-200 bg-blue-50/50">
          <header className="border-b border-blue-200 px-6 py-3">
            <h2 className="text-sm font-semibold text-blue-900">
              Waiting for your signature{' '}
              <span className="font-normal text-blue-700">({mine.length})</span>
            </h2>
          </header>
          <ul className="divide-y divide-blue-100">
            {mine.map(l => (
              <li key={l.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <div className="text-sm font-medium">
                    {l.employee.firstName} {l.employee.lastName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {l.type === 'EMPLOYMENT' ? 'Employment letter' : 'Confirmation letter'}
                    {l.employee.position ? ` · ${l.employee.position}` : ''}
                  </div>
                </div>
                <Link href={`/letters/${l.id}`} className="text-sm font-medium text-primary hover:underline">
                  Review &amp; sign →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isHr &&
        (letters.length === 0 ? (
          <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
            No letters in the queue.
          </p>
        ) : (
          <section className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Employee</th>
                  <th className="px-6 py-3 font-medium">Letter</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Signatory</th>
                  <th className="px-6 py-3 font-medium">Due</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {letters.map(l => {
                  const status = l.overdue && l.status === 'PENDING_SIGNATURE' ? 'OVERDUE' : l.status
                  return (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="px-6 py-3">
                        <div className="font-medium">
                          {l.employee.firstName} {l.employee.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {l.employee.position ?? '—'} · {l.employee.department ?? '—'}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {l.type === 'EMPLOYMENT' ? 'Employment' : 'Confirmation'}
                        {l.kind && (
                          <div className="text-xs">{LETTER_KIND_LABELS[l.kind as LetterKindName]}</div>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-xs font-medium',
                            STATUS_STYLE[status] ?? '',
                          )}
                        >
                          {STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {l.approvingOfficer
                          ? `${l.approvingOfficer.firstName} ${l.approvingOfficer.lastName}`
                          : '—'}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{fmt(l.dueDate)}</td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/letters/${l.id}`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        ))}
    </div>
  )
}
