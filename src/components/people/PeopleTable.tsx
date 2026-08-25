'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Users, GitBranch } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { can } from '@/lib/permissions'

type User = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  department?: string | null
  position?: string | null
  country: string
  status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
  employmentType: string
  profilePhotoUrl?: string | null
  reportingManagerId?: string | null
  role: string
  _count: { directReports: number }
}

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

function StatusBadge({ status }: { status: User['status'] }) {
  const variants = {
    ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    INACTIVE: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    TERMINATED: 'bg-rose-50 text-rose-700 border-rose-200',
  }
  const labels = { ACTIVE: 'Active', INACTIVE: 'Inactive', TERMINATED: 'Terminated' }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${variants[status]}`}
    >
      {labels[status]}
    </span>
  )
}

const COUNTRY_LABELS: Record<string, string> = {
  SG: 'Singapore',
  MY: 'Malaysia',
}

type Props = {
  userRole: string
}

export function PeopleTable({ userRole }: Props) {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showTerminated, setShowTerminated] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams()
    if (showTerminated || filterStatus === 'TERMINATED' || filterStatus === 'INACTIVE') params.set('includeTerminated', 'true')

    fetch(`/api/users?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users ?? [])
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load people')
        setLoading(false)
      })
  }, [showTerminated, filterStatus])

  const departments = useMemo(
    () => [...new Set(users.map((u) => u.department).filter(Boolean) as string[])].sort(),
    [users]
  )

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const fullName = `${u.firstName} ${u.lastName}`.toLowerCase()
      if (search && !fullName.includes(search.toLowerCase())) return false
      if (filterDepartment && u.department !== filterDepartment) return false
      if (filterCountry && u.country !== filterCountry) return false
      if (filterStatus && u.status !== filterStatus) return false
      return true
    })
  }, [users, search, filterDepartment, filterCountry, filterStatus])

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-card" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-card p-8 text-center text-muted-foreground">{error}</div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Department filter */}
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Country filter */}
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            <option value="">All Locations</option>
            {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="TERMINATED">Terminated</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* Show terminated toggle */}
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showTerminated}
              onChange={(e) => setShowTerminated(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Show terminated
          </label>

          {/* Org chart — the whole company's reporting lines, so HR only */}
          {can(userRole, 'people.read.directory') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/people/org-chart')}
            >
              <GitBranch className="h-4 w-4" />
              Org Chart
            </Button>
          )}

          {/* Add Employee (admin only) */}
          {can(userRole, 'people.write') && (
            <Button size="sm" onClick={() => router.push('/people/new')}>
              <Users className="h-4 w-4" />
              Add Employee
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Email</th>
              <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Department</th>
              <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Position</th>
              <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Location</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No employees found
                </td>
              </tr>
            ) : (
              filtered.map((user) => (
                <tr
                  key={user.id}
                  className="cursor-pointer transition-colors hover:bg-muted/20"
                  onClick={() => router.push(`/people/${user.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <InitialsAvatar firstName={user.firstName} lastName={user.lastName} />
                      <span className="font-medium">
                        {user.firstName} {user.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {user.email}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {user.department ?? '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                    {user.position ?? '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                    {COUNTRY_LABELS[user.country] ?? user.country}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={user.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {users.length} employees
      </p>
    </div>
  )
}
