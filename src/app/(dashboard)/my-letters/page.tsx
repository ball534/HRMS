import Link from 'next/link'
import { getMyLetters } from '@/actions/letters'
import { LETTER_KIND_LABELS, type LetterKindName } from '@/lib/letterSections'
import { cn } from '@/lib/utils'

const STATUS_STYLE: Record<string, string> = {
  PENDING_SIGNATURE: 'bg-zinc-100 border-zinc-200 text-zinc-600',
  SIGNED: 'bg-zinc-100 border-zinc-200 text-zinc-600',
  SENT: 'bg-amber-50 border-amber-200 text-amber-700',
  ACCEPTED: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  DECLINED: 'bg-rose-50 border-rose-200 text-rose-700',
  OVERDUE: 'bg-rose-50 border-rose-200 text-rose-700',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_SIGNATURE: 'Being prepared',
  SIGNED: 'Being prepared',
  SENT: 'Needs your signature',
  ACCEPTED: 'Signed',
  DECLINED: 'Declined',
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
 * Everyone's own letters. There was no such screen before: a letter existed
 * only inside the HR queue, so an employee who lost the email had no way to
 * read what they had signed.
 */
export default async function MyLettersPage() {
  const letters = await getMyLetters()
  const awaiting = letters.filter(l => l.status === 'SENT')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My letters</h1>
        <p className="text-muted-foreground">
          Your employment and confirmation letters, and anything waiting for your signature.
        </p>
      </div>

      {awaiting.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You have {awaiting.length} letter{awaiting.length === 1 ? '' : 's'} waiting for your
          signature.
        </div>
      )}

      {letters.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
          You have no letters yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {letters.map(l => (
            <li
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
            >
              <div>
                <div className="font-medium">
                  {l.type === 'EMPLOYMENT' ? 'Employment letter' : 'Confirmation letter'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {l.kind ? `${LETTER_KIND_LABELS[l.kind as LetterKindName]} · ` : ''}
                  Issued {fmt(l.sentAt ?? l.createdAt)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-xs font-medium',
                    STATUS_STYLE[l.status] ?? '',
                  )}
                >
                  {STATUS_LABEL[l.status] ?? l.status}
                </span>
                <Link
                  href={`/my-letters/${l.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {l.status === 'SENT' ? 'Read & sign →' : 'Open →'}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
