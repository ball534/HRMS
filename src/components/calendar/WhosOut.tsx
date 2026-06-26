'use client'

import { useEffect, useState } from 'react'

const AVATAR_COLORS = [
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-blue-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-pink-500',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function InitialsAvatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  const color = getAvatarColor(`${firstName}${lastName}`)
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${color}`}
    >
      {initials}
    </div>
  )
}

type LeaveEntry = {
  id: string
  firstName: string
  lastName: string
  country: string
  leaveType: string
  halfDay: 'NONE' | 'AM' | 'PM'
}

type ScopeData = {
  entries: LeaveEntry[]
  loading: boolean
}

function useScopeData(scope: 'today' | 'tomorrow'): ScopeData {
  const [entries, setEntries] = useState<LeaveEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/calendar/leaves?scope=${scope}`)
      .then((res) => res.json())
      .then((data) => {
        setEntries(
          (data.events ?? []).map(
            (e: {
              id: string
              firstName: string
              lastName: string
              country: string
              leaveType: string
              halfDay: 'NONE' | 'AM' | 'PM'
            }) => ({
              id: e.id,
              firstName: e.firstName,
              lastName: e.lastName,
              country: e.country,
              leaveType: e.leaveType,
              halfDay: e.halfDay,
            })
          )
        )
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [scope])

  return { entries, loading }
}

function PersonRow({ entry }: { entry: LeaveEntry }) {
  const halfDaySuffix =
    entry.halfDay === 'AM' ? ' (AM)' : entry.halfDay === 'PM' ? ' (PM)' : ''

  return (
    <div className="flex items-center gap-3 py-2">
      <InitialsAvatar firstName={entry.firstName} lastName={entry.lastName} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {entry.firstName} {entry.lastName}
          {halfDaySuffix && (
            <span className="ml-1 text-xs text-muted-foreground">{halfDaySuffix}</span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">{entry.leaveType}</p>
      </div>
      <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
        {entry.country}
      </span>
    </div>
  )
}

function ScopeSection({
  label,
  entries,
  loading,
  emptyMessage,
}: {
  label: string
  entries: LeaveEntry[]
  loading: boolean
  emptyMessage: string
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <PersonRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}

export function WhosOut() {
  const today = useScopeData('today')
  const tomorrow = useScopeData('tomorrow')

  return (
    <div className="space-y-6">
      <ScopeSection
        label="Out Today"
        entries={today.entries}
        loading={today.loading}
        emptyMessage="Nobody is out today"
      />
      <ScopeSection
        label="Out Tomorrow"
        entries={tomorrow.entries}
        loading={tomorrow.loading}
        emptyMessage="Nobody is out tomorrow"
      />
    </div>
  )
}
