'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveEntry, approveEntries, rejectEntry, type TimeEntryActionState } from '@/actions/timeEntry'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Entry = {
  id: string
  workDate: string
  hoursWorked: string | number
  isPublicHoliday: boolean
  description: string | null
  user: { id: string; firstName: string; lastName: string; hourlyRate: string | number | null }
}

type Props = {
  entries: Entry[]
}

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function mondayOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - (day - 1))
  return d
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })
}

function fmtWeek(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setUTCDate(sunday.getUTCDate() + 6)
  return `${monday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })} – ${sunday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })}`
}

export function ApprovalQueue({ entries }: Props) {
  const router = useRouter()
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [groupBanner, setGroupBanner] = useState<{ key: string; msg: string } | null>(null)

  // Group: userId → weekKey → list of entries
  const grouped = useMemo(() => {
    const byUser = new Map<string, Map<string, { weekStart: Date; entries: Entry[]; user: Entry['user'] }>>()
    for (const e of entries) {
      const wd = new Date(e.workDate)
      const wk = isoWeekKey(wd)
      const monday = mondayOfWeek(wd)
      const uMap = byUser.get(e.user.id) ?? new Map()
      const bucket = uMap.get(wk) ?? { weekStart: monday, entries: [], user: e.user }
      bucket.entries.push(e)
      uMap.set(wk, bucket)
      byUser.set(e.user.id, uMap)
    }
    return byUser
  }, [entries])

  function setRowPending(id: string, on: boolean) {
    setPendingIds(prev => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function handleApprove(id: string) {
    setRowPending(id, true)
    startTransition(async () => {
      const r = await approveEntry(id)
      setRowPending(id, false)
      if (!r.error) router.refresh()
    })
  }

  function handleApproveWeek(key: string, ids: string[]) {
    ids.forEach(id => setRowPending(id, true))
    startTransition(async () => {
      const r = await approveEntries(ids)
      ids.forEach(id => setRowPending(id, false))
      if (!r.error) {
        setGroupBanner({ key, msg: `Approved ${r.approved ?? 0} entries.` })
        router.refresh()
      } else {
        setGroupBanner({ key, msg: r.error })
      }
    })
  }

  function openReject(id: string) {
    setRejectingId(id)
    setRejectReason('')
    setRejectError(null)
  }

  function handleRejectSubmit() {
    if (!rejectingId) return
    if (!rejectReason.trim()) {
      setRejectError('Reason is required.')
      return
    }
    const id = rejectingId
    setRowPending(id, true)
    const fd = new FormData()
    fd.append('entryId', id)
    fd.append('reason', rejectReason.trim())
    startTransition(async () => {
      const r = await rejectEntry({} as TimeEntryActionState, fd)
      setRowPending(id, false)
      if (r.error) setRejectError(r.error)
      else {
        setRejectingId(null)
        setRejectReason('')
        router.refresh()
      }
    })
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl bg-card p-12 text-center ring-1 ring-foreground/10">
        <p className="text-muted-foreground">
          Nothing to approve. When your direct reports submit a week, their entries appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([userId, weekMap]) => {
        const user = Array.from(weekMap.values())[0].user
        return (
          <section key={userId} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            <header className="border-b border-border bg-muted/40 px-6 py-3">
              <h2 className="text-sm font-semibold">
                {user.firstName} {user.lastName}
                {user.hourlyRate !== null && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    @ {Number(user.hourlyRate).toFixed(2)}/hr
                  </span>
                )}
              </h2>
            </header>

            <div className="divide-y divide-border">
              {Array.from(weekMap.entries()).map(([wk, bucket]) => {
                const totalHours = bucket.entries.reduce((sum, e) => sum + Number(e.hoursWorked), 0)
                const phHours = bucket.entries
                  .filter(e => e.isPublicHoliday)
                  .reduce((sum, e) => sum + Number(e.hoursWorked), 0)
                const bannerKey = `${userId}-${wk}`
                const banner = groupBanner?.key === bannerKey ? groupBanner.msg : null
                const ids = bucket.entries.map(e => e.id)
                const allBusy = ids.every(id => pendingIds.has(id))

                return (
                  <div key={wk} className="p-6 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{fmtWeek(bucket.weekStart)}</p>
                        <p className="text-xs text-muted-foreground">
                          {bucket.entries.length} entries · {totalHours.toFixed(2)}h total
                          {phHours > 0 && ` · ${phHours.toFixed(2)}h on public holiday`}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleApproveWeek(bannerKey, ids)}
                        disabled={allBusy}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white border-transparent"
                      >
                        Approve whole week
                      </Button>
                    </div>

                    {banner && (
                      <p className="text-sm text-emerald-600">{banner}</p>
                    )}

                    <ul className="space-y-2">
                      {bucket.entries.map((e) => {
                        const busy = pendingIds.has(e.id)
                        const isRejectOpen = rejectingId === e.id
                        return (
                          <li key={e.id} className="rounded-lg border border-border bg-background p-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="text-sm font-medium">
                                  {fmtDate(new Date(e.workDate))}
                                </span>
                                <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
                                  {Number(e.hoursWorked).toFixed(2)}h
                                </span>
                                {e.isPublicHoliday && (
                                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                                    PUBLIC HOLIDAY
                                  </span>
                                )}
                                {e.description && (
                                  <span className="text-xs text-muted-foreground">
                                    “{e.description}”
                                  </span>
                                )}
                              </div>

                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleApprove(e.id)}
                                  disabled={busy}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white border-transparent"
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openReject(e.id)}
                                  disabled={busy || isRejectOpen}
                                  className="border-rose-300 text-rose-700 hover:bg-rose-50"
                                >
                                  Reject
                                </Button>
                              </div>
                            </div>

                            {isRejectOpen && (
                              <div className="mt-3 space-y-2 border-t border-border pt-3">
                                <label className="text-xs font-medium">Reason (required)</label>
                                <Input
                                  value={rejectReason}
                                  onChange={(ev) => setRejectReason(ev.target.value)}
                                  placeholder="e.g. Wrong hours, please re-enter"
                                  autoFocus
                                />
                                {rejectError && <p className="text-xs text-rose-600">{rejectError}</p>}
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={handleRejectSubmit}
                                    disabled={busy}
                                    className="bg-rose-600 hover:bg-rose-500 text-white border-transparent"
                                  >
                                    Send rejection
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setRejectingId(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
