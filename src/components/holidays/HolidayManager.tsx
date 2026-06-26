'use client'

import { useActionState, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { createHoliday, updateHoliday, type HolidayState } from '@/actions/holidays'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Pencil, X } from 'lucide-react'

type Holiday = {
  id: string
  country: string
  date: string
  name: string
  year: number
  isObserved: boolean
  type: string
}

const COUNTRY_LABELS: Record<string, string> = {
  SG: 'Singapore',
  MY: 'Malaysia',
}

const initialState: HolidayState = {}

function FieldError({ errors, name }: { errors?: Record<string, string[]>; name: string }) {
  const msgs = errors?.[name]
  if (!msgs?.length) return null
  return <p className="mt-0.5 text-xs text-rose-600">{msgs[0]}</p>
}

type AddFormProps = {
  country: string
  year: number
  onSuccess: () => void
  onCancel: () => void
}

function AddHolidayForm({ country, year, onSuccess, onCancel }: AddFormProps) {
  const [state, formAction, isPending] = useActionState(createHoliday, initialState)

  useEffect(() => {
    if (state.success) onSuccess()
  }, [state.success, onSuccess])

  return (
    <form action={formAction} className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
      <h3 className="mb-3 text-sm font-semibold">Add Holiday</h3>
      <input type="hidden" name="country" value={country} />
      <input type="hidden" name="year" value={year} />

      {state.error && (
        <div className="mb-3 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
          {state.error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="add-date" className="text-xs">Date *</Label>
          <Input id="add-date" name="date" type="date" className="mt-1 h-7 text-xs" required />
          <FieldError errors={state.errors} name="date" />
        </div>
        <div>
          <Label htmlFor="add-name" className="text-xs">Name *</Label>
          <Input id="add-name" name="name" placeholder="Holiday name" className="mt-1 h-7 text-xs" required />
          <FieldError errors={state.errors} name="name" />
        </div>
        <div>
          <Label htmlFor="add-type" className="text-xs">Type</Label>
          <select
            id="add-type"
            name="type"
            className="mt-1 h-7 w-full rounded-lg border border-input bg-transparent px-2 text-xs focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            <option value="PUBLIC_HOLIDAY">Public Holiday</option>
            <option value="COLLECTIVE_LEAVE">Collective Leave</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" name="isObserved" value="true" defaultChecked className="h-3.5 w-3.5" />
            Is Observed
          </label>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Adding...' : 'Add'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

type EditFormProps = {
  holiday: Holiday
  onSuccess: () => void
  onCancel: () => void
}

function EditHolidayForm({ holiday, onSuccess, onCancel }: EditFormProps) {
  const [state, formAction, isPending] = useActionState(updateHoliday, initialState)

  useEffect(() => {
    if (state.success) onSuccess()
  }, [state.success, onSuccess])

  return (
    <form action={formAction} className="inline-flex items-center gap-2 flex-wrap">
      <input type="hidden" name="id" value={holiday.id} />

      {state.error && (
        <span className="text-xs text-rose-600">{state.error}</span>
      )}

      <Input
        name="name"
        defaultValue={holiday.name}
        className="h-6 w-48 text-xs"
        required
      />
      <Input
        name="date"
        type="date"
        defaultValue={holiday.date.split('T')[0]}
        className="h-6 w-36 text-xs"
        required
      />
      <select
        name="type"
        defaultValue={holiday.type}
        className="h-6 rounded-md border border-input bg-transparent px-2 text-xs focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
      >
        <option value="PUBLIC_HOLIDAY">Public</option>
        <option value="COLLECTIVE_LEAVE">Collective Leave</option>
      </select>
      <input type="hidden" name="isObserved" value={holiday.isObserved ? 'true' : 'false'} />
      <Button type="submit" size="xs" disabled={isPending}>
        {isPending ? '...' : 'Save'}
      </Button>
      <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
        <X className="h-3 w-3" />
      </Button>
    </form>
  )
}

export function HolidayManager() {
  const [country, setCountry] = useState('SG')
  const [year, setYear] = useState(2026)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function loadHolidays() {
    setLoading(true)
    fetch(`/api/holidays?country=${country}&year=${year}`)
      .then((r) => r.json())
      .then((data) => {
        setHolidays(data.holidays ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    loadHolidays()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, year])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Country</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <Button
          size="sm"
          onClick={() => { setShowAddForm(true); setEditingId(null) }}
        >
          <Plus className="h-4 w-4" />
          Add Holiday
        </Button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <AddHolidayForm
          country={country}
          year={year}
          onSuccess={() => { setShowAddForm(false); loadHolidays() }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Table */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-medium">
            {COUNTRY_LABELS[country]} — {year} ({holidays.length} entries)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-muted/30" />
              ))}
            </div>
          ) : holidays.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No holidays found. Use &quot;Add Holiday&quot; to create entries.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/20 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-left font-medium">Name</th>
                    <th className="hidden px-4 py-2 text-left font-medium sm:table-cell">Type</th>
                    <th className="hidden px-4 py-2 text-left font-medium sm:table-cell">Observed</th>
                    <th className="px-4 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {holidays.map((h) => (
                    <tr key={h.id} className="hover:bg-muted/10">
                      {editingId === h.id ? (
                        <td colSpan={5} className="px-4 py-2">
                          <EditHolidayForm
                            holiday={h}
                            onSuccess={() => { setEditingId(null); loadHolidays() }}
                            onCancel={() => setEditingId(null)}
                          />
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-2 text-muted-foreground">
                            {format(new Date(h.date), 'MMM d, yyyy')}
                          </td>
                          <td className="px-4 py-2 font-medium">{h.name}</td>
                          <td className="hidden px-4 py-2 text-xs text-muted-foreground sm:table-cell">
                            {h.type === 'COLLECTIVE_LEAVE' ? 'Collective Leave' : 'Public Holiday'}
                          </td>
                          <td className="hidden px-4 py-2 sm:table-cell">
                            {h.isObserved ? (
                              <span className="text-emerald-600 text-xs">Yes</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">No</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => { setEditingId(h.id); setShowAddForm(false) }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
