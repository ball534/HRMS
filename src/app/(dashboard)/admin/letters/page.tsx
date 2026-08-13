import Link from 'next/link'
import { requireCapability } from '@/lib/dal'
import { getLettersToReview } from '@/actions/letters'
import { cn } from '@/lib/utils'

const STATUS_STYLE: Record<string, string> = {
  PENDING_REVIEW: 'bg-amber-50 border-amber-200 text-amber-700',
  PENDING_SIGNATURE: 'bg-blue-50 border-blue-200 text-blue-700',
  SIGNED: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  OVERDUE: 'bg-rose-50 border-rose-200 text-rose-700',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: 'Pending review',
  PENDING_SIGNATURE: 'Awaiting signature',
  SIGNED: 'Signed',
  OVERDUE: 'Overdue',
}

function fmt(d: Date | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export default async function LettersPage() {
  await requireCapability('letters.read')
  const letters = await getLettersToReview()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Letters</h1>
        <p className="text-muted-foreground">
          Employment &amp; confirmation letters awaiting review, signature, or delivery.
        </p>
      </div>

      {letters.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
          No letters in the queue.
        </p>
      ) : (
        <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-3 font-medium">Employee</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Officer</th>
                <th className="px-6 py-3 font-medium">Due</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {letters.map(l => {
                const status = l.overdue && l.status !== 'SIGNED' ? 'OVERDUE' : l.status
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
                    </td>
                    <td className="px-6 py-3">
                      <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_STYLE[status] ?? '')}>
                        {STATUS_LABEL[status] ?? status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {l.approvingOfficer ? `${l.approvingOfficer.firstName} ${l.approvingOfficer.lastName}` : '—'}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{fmt(l.dueDate)}</td>
                    <td className="px-6 py-3 text-right">
                      <Link href={`/admin/letters/${l.id}`} className="text-sm font-medium text-primary hover:underline">
                        Open →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
