'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { submitWeek } from '@/actions/timeEntry'
import { Button } from '@/components/ui/button'
import { TimeEntryDialog, type DialogEntry } from '@/components/time/TimeEntryDialog'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

type Entry = {
  id: string
  workDate: string // ISO string
  hoursWorked: string | number | null
  startTime: string | null
  endTime: string | null
  breakMinutes: number
  description: string | null
  isPublicHoliday: boolean
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  rejectionReason: string | null
}

type Holiday = {
  date: string
  name: string
}

type Props = {
  weekStartIso: string // YYYY-MM-DD (Monday)
  weekEndIso: string
  entries: Entry[]
  holidays: Holiday[]
  isPartTime: boolean
}

const STATUS_PILL: Record<string, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  SUBMITTED: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function dayLabel(d: Date): { weekday: string; date: string } {
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
    date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }),
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return ymd(d)
}

export function WeeklyTimesheet({
  weekStartIso,
  weekEndIso,
  entries,
  holidays,
  isPartTime,
}: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [submitMsg, setSubmitMsg] = useState<string | null>(null)
  const [submitErr, setSubmitErr] = useState<string | null>(null)
  const [dialogState, setDialogState] = useState<{ entry: DialogEntry; editable: boolean } | null>(null)

  const start = useMemo(() => new Date(`${weekStartIso}T00:00:00.000Z`), [weekStartIso])

  const days = useMemo(() => {
    const arr: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setUTCDate(start.getUTCDate() + i)
      arr.push(d)
    }
    return arr
  }, [start])

  const entriesByDate = useMemo(() => {
    const m = new Map<string, Entry>()
    for (const e of entries) {
      // workDate is an ISO timestamp like "2026-05-12T00:00:00.000Z"; we key by YYYY-MM-DD
      const key = e.workDate.slice(0, 10)
      m.set(key, e)
    }
    return m
  }, [entries])

  const holidaysByDate = useMemo(() => {
    const m = new Map<string, string>()
    for (const h of holidays) {
      m.set(h.date.slice(0, 10), h.name)
    }
    return m
  }, [holidays])

  const draftCount = entries.filter(e => e.status === 'DRAFT').length

  function gotoWeek(newStart: string) {
    const sp = new URLSearchParams(params.toString())
    sp.set('week', newStart)
    router.push(`/time?${sp.toString()}`)
  }

  function openDay(dateIso: string) {
    if (!isPartTime) return
    const existing = entriesByDate.get(dateIso)
    const holiday = holidaysByDate.get(dateIso)
    const editable = !existing || existing.status === 'DRAFT' || existing.status === 'REJECTED'

    setDialogState({
      entry: {
        id: existing?.id,
        workDate: dateIso,
        hoursWorked: existing ? Number(existing.hoursWorked) : null,
        startTime: existing?.startTime ? existing.startTime.slice(11, 16) : null,
        endTime: existing?.endTime ? existing.endTime.slice(11, 16) : null,
        breakMinutes: existing?.breakMinutes ?? 0,
        description: existing?.description ?? null,
        status: (existing?.status ?? 'NEW') as DialogEntry['status'],
        rejectionReason: existing?.rejectionReason ?? null,
        isPublicHoliday: !!holiday || existing?.isPublicHoliday || false,
        holidayName: holiday ?? null,
      },
      editable,
    })
  }

  function handleSubmitWeek() {
    setSubmitErr(null)
    setSubmitMsg(null)
    startTransition(async () => {
      const r = await submitWeek(weekStartIso)
      if (r.error) setSubmitErr(r.error)
      else {
        setSubmitMsg(`Submitted ${r.submitted ?? 0} day${(r.submitted ?? 0) === 1 ? '' : 's'} for approval.`)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* Week nav */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => gotoWeek(addDays(weekStartIso, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => gotoWeek(ymd(new Date()))}>
            This week
          </Button>
          <Button variant="outline" size="sm" onClick={() => gotoWeek(addDays(weekStartIso, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <p className="ml-2 text-sm text-muted-foreground">
            {new Date(weekStartIso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
            {' '}–{' '}
            {new Date(weekEndIso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
          </p>
        </div>

        {isPartTime && (
          <div className="flex items-center gap-3">
            {submitMsg && <span className="text-sm text-emerald-600">{submitMsg}</span>}
            {submitErr && <span className="text-sm text-rose-600">{submitErr}</span>}
            <Button onClick={handleSubmitWeek} disabled={pending || draftCount === 0}>
              {pending ? 'Submitting…' : `Submit week (${draftCount})`}
            </Button>
          </div>
        )}
      </div>

      {!isPartTime && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          Timesheet entry is only available for part-time employees. Your employment type is not set to
          <code className="mx-1 rounded bg-white/60 px-1.5 py-0.5 text-xs">PART_TIME</code>.
          {' '}Ask HR to update your profile if this is wrong.
        </div>
      )}

      {/* Day grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((d) => {
          const iso = ymd(d)
          const lbl = dayLabel(d)
          const e = entriesByDate.get(iso)
          const ph = holidaysByDate.get(iso)
          return (
            <button
              key={iso}
              type="button"
              onClick={() => openDay(iso)}
              disabled={!isPartTime}
              className={cn(
                'flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-colors',
                isPartTime ? 'hover:bg-accent ring-1 ring-foreground/10 border-transparent' : 'cursor-not-allowed opacity-60 border-border',
              )}
            >
              <div className="flex w-full items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {lbl.weekday}
                  </p>
                  <p className="text-sm font-semibold">{lbl.date}</p>
                </div>
                {ph && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                    PH
                  </span>
                )}
              </div>
              {e ? (
                <>
                  <p className="text-lg font-semibold">{Number(e.hoursWorked).toFixed(2)}<span className="ml-0.5 text-xs font-normal text-muted-foreground">h</span></p>
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                      STATUS_PILL[e.status],
                    )}
                  >
                    {STATUS_LABEL[e.status]}
                  </span>
                </>
              ) : (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Plus className="h-3 w-3" />
                  Log hours
                </p>
              )}
              {ph && (
                <p className="line-clamp-1 text-[10px] text-muted-foreground" title={ph}>
                  {ph}
                </p>
              )}
            </button>
          )
        })}
      </div>

      {dialogState && (
        <TimeEntryDialog
          open={!!dialogState}
          onOpenChange={(o) => !o && setDialogState(null)}
          entry={dialogState.entry}
          editable={dialogState.editable}
        />
      )}

      <p className="text-xs text-muted-foreground">
        You can edit drafts and rejected entries up to 14 days back. Submitted entries lock until your
        manager approves or rejects. <Link href="/time/approvals" className="text-primary hover:underline">View approvals</Link>
      </p>
    </div>
  )
}
