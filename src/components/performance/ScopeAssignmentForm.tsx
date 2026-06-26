'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { scopeReviews } from '@/actions/performance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Candidate = {
  id: string
  firstName: string
  lastName: string
  email: string
  country: string
  department: string | null
  position: string | null
  employmentType: string
}

type Props = {
  cycleId: string
  disabled?: boolean
  disabledReason?: string
  candidates: Candidate[]
}

export function ScopeAssignmentForm({ cycleId, disabled, disabledReason, candidates }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [employmentType, setEmploymentType] = useState<'ALL' | 'EMPLOYEE' | 'CONTRACTOR' | 'PART_TIME'>('ALL')
  const [country, setCountry] = useState<'ALL' | 'SG' | 'MY'>('ALL')
  const [department, setDepartment] = useState('')
  const [result, setResult] = useState<{ created: number; error?: string } | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  if (disabled) {
    return (
      <p className="text-sm text-muted-foreground">
        {disabledReason ?? 'Scope can only be modified on DRAFT or ACTIVE cycles.'}
      </p>
    )
  }

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter(c =>
      `${c.firstName} ${c.lastName} ${c.email} ${c.position ?? ''} ${c.department ?? ''}`
        .toLowerCase()
        .includes(q),
    )
  }, [candidates, query])

  function togglePick(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addByFilters() {
    startTransition(async () => {
      setResult(null)
      const r = await scopeReviews(cycleId, {
        employmentType,
        country,
        department: department || null,
      })
      setResult(r)
      if (!r.error) router.refresh()
    })
  }

  function addByPicked() {
    startTransition(async () => {
      setResult(null)
      const ids = Array.from(picked)
      if (ids.length === 0) return
      const r = await scopeReviews(cycleId, { employeeIds: ids })
      setResult(r)
      if (!r.error) {
        setPicked(new Set())
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Filter mode */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Add by filter
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="scope-emp">Employment type</Label>
            <select
              id="scope-emp"
              value={employmentType}
              onChange={e => setEmploymentType(e.target.value as typeof employmentType)}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none"
            >
              <option value="ALL">All</option>
              <option value="EMPLOYEE">Full-time employees</option>
              <option value="CONTRACTOR">Contractors</option>
              <option value="PART_TIME">Part-time</option>
            </select>
          </div>
          <div>
            <Label htmlFor="scope-country">Country</Label>
            <select
              id="scope-country"
              value={country}
              onChange={e => setCountry(e.target.value as typeof country)}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none"
            >
              <option value="ALL">All</option>
              <option value="SG">Singapore</option>
              <option value="MY">Malaysia</option>
            </select>
          </div>
          <div>
            <Label htmlFor="scope-dept">Department (exact match)</Label>
            <Input
              id="scope-dept"
              value={department}
              onChange={e => setDepartment(e.target.value)}
              placeholder="e.g. Stores SG"
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Button onClick={addByFilters} disabled={pending} size="sm">
            {pending ? 'Adding…' : 'Add matching employees'}
          </Button>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Individual picker */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Or pick specific employees
            </h3>
            <p className="text-xs text-muted-foreground">
              {candidates.length} active employee{candidates.length === 1 ? '' : 's'} not yet in this cycle.
            </p>
          </div>
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, email, position…"
            className="max-w-xs"
          />
        </div>

        {filteredCandidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {candidates.length === 0 ? 'Everyone already scoped.' : 'No matches.'}
          </p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2">
            {filteredCandidates.map(c => {
              const checked = picked.has(c.id)
              return (
                <li key={c.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm',
                      checked && 'bg-accent',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePick(c.id)}
                    />
                    <div className="flex-1">
                      <p className="font-medium">
                        {c.firstName} {c.lastName}
                        <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                          {c.country}
                        </span>
                        <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                          {c.employmentType === 'PART_TIME' ? 'PT' : c.employmentType === 'CONTRACTOR' ? 'Contractor' : 'FT'}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.position ?? '—'} · {c.department ?? '—'}
                      </p>
                    </div>
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex items-center gap-3">
          <Button
            onClick={addByPicked}
            disabled={pending || picked.size === 0}
            size="sm"
          >
            {pending ? 'Adding…' : `Add ${picked.size} picked`}
          </Button>
          {picked.size > 0 && (
            <button
              onClick={() => setPicked(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear selection
            </button>
          )}
        </div>
      </div>

      {result?.error && <p className="text-sm text-rose-600">{result.error}</p>}
      {result && !result.error && (
        <p className="text-sm text-emerald-600">
          {result.created === 0
            ? 'No new employees matched (or all already scoped).'
            : `${result.created} review${result.created === 1 ? '' : 's'} created.`}
        </p>
      )}
    </div>
  )
}
