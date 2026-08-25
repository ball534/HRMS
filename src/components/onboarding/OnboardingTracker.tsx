'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type Row = {
  id: string
  userId: string
  name: string
  email: string
  position: string | null
  department: string | null
  isPr: boolean
  startDate: string | null
  requestedAt: string
  submittedAt: string | null
  bankName: string | null
  bankAccountName: string | null
  bankAccountNumber: string | null
  prGrantDate: string | null
  documents: { label: string; blobId: string | null }[]
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * HR's view of who owes documents.
 *
 * Account numbers are masked until asked for. Not because HR may not see them —
 * payroll needs them — but because a screen HR keeps open all day should not put
 * every new hire's bank details on display behind them.
 */
export function OnboardingTracker({ rows }: { rows: Row[] }) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const outstanding = rows.filter(r => !r.submittedAt)
  const done = rows.filter(r => r.submittedAt)

  function toggle(id: string) {
    setRevealed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function mask(value: string | null) {
    if (!value) return '—'
    if (value.length <= 4) return '••••'
    return `${'•'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Document tracker</h2>
        <p className="text-sm text-muted-foreground">
          Opened automatically when someone signs their letter.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
          Nobody has been asked for onboarding documents yet.
        </p>
      ) : (
        <>
          {outstanding.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>{outstanding.length}</strong> new hire
              {outstanding.length === 1 ? '' : 's'} have not sent their documents yet.
            </div>
          )}

          <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Employee</th>
                  <th className="px-6 py-3 font-medium">Asked</th>
                  <th className="px-6 py-3 font-medium">Sent</th>
                  <th className="px-6 py-3 font-medium">Bank</th>
                  <th className="px-6 py-3 font-medium">Files</th>
                </tr>
              </thead>
              <tbody>
                {[...outstanding, ...done].map(row => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-6 py-3">
                      <Link href={`/people/${row.userId}`} className="font-medium hover:underline">
                        {row.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {[row.position, row.department, row.isPr ? 'SG PR' : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{fmt(row.requestedAt)}</td>
                    <td className="px-6 py-3">
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-xs font-medium',
                          row.submittedAt
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700',
                        )}
                      >
                        {row.submittedAt ? fmt(row.submittedAt) : 'Outstanding'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {row.submittedAt ? (
                        <>
                          <div>{row.bankName ?? '—'}</div>
                          <div className="font-mono text-xs">
                            {revealed.has(row.id) ? row.bankAccountNumber : mask(row.bankAccountNumber)}
                            {row.bankAccountNumber && (
                              <button
                                type="button"
                                onClick={() => toggle(row.id)}
                                className="ml-2 font-sans text-xs text-primary hover:underline"
                              >
                                {revealed.has(row.id) ? 'hide' : 'show'}
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-wrap gap-2">
                        {row.documents
                          .filter(d => d.blobId)
                          .map(d => (
                            <a
                              key={d.label}
                              href={`/api/files/${d.blobId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-full border border-border px-2 py-0.5 text-xs text-primary hover:underline"
                            >
                              {d.label}
                            </a>
                          ))}
                        {row.documents.every(d => !d.blobId) && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
