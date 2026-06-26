'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

type LeaveRequest = {
  id: string
  startDate: Date | string
  endDate: Date | string
  halfDay: 'NONE' | 'AM' | 'PM'
  daysCount: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  createdAt: Date | string
  leaveType: {
    name: string
  }
}

type Props = {
  requests: LeaveRequest[]
}

const STATUS_CLASSES = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
}

const STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function LeaveHistoryTable({ requests }: Props) {
  const router = useRouter()

  if (requests.length === 0) {
    return (
      <div className="rounded-xl bg-card p-12 text-center ring-1 ring-foreground/10">
        <p className="mb-4 text-muted-foreground">No leave requests yet.</p>
        <Button size="sm" onClick={() => router.push('/leave/request')}>
          Request Leave
        </Button>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Leave Type</th>
            <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Start</th>
            <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">End</th>
            <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Days</th>
            <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Half Day</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="hidden px-4 py-3 text-left font-medium xl:table-cell">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {requests.map((r) => (
            <tr
              key={r.id}
              className="cursor-pointer transition-colors hover:bg-muted/20"
              onClick={() => router.push(`/leave/${r.id}`)}
            >
              <td className="px-4 py-3 font-medium">{r.leaveType.name}</td>
              <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                {formatDate(r.startDate)}
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                {formatDate(r.endDate)}
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                {r.daysCount} {r.daysCount === 1 ? 'day' : 'days'}
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                {r.halfDay === 'NONE' ? '—' : r.halfDay}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[r.status]}`}
                >
                  {STATUS_LABELS[r.status]}
                </span>
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">
                {formatDate(r.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
