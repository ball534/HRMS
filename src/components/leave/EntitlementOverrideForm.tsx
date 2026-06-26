'use client'

import { useActionState, useState, useEffect, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  setEntitlementOverride,
  getLeaveBalances,
  type SetEntitlementState,
} from '@/actions/leaveBalance'

type User = { id: string; firstName: string; lastName: string; email: string }
type LeaveType = { id: string; name: string }

type Props = { users: User[]; leaveTypes: LeaveType[] }

const initialState: SetEntitlementState = {}
const currentYear = new Date().getFullYear()
const YEARS = [currentYear - 1, currentYear, currentYear + 1]

export function EntitlementOverrideForm({ users, leaveTypes }: Props) {
  const [state, formAction, isPending] = useActionState(setEntitlementOverride, initialState)

  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [year, setYear] = useState(currentYear.toString())
  const [override, setOverride] = useState('')
  const [info, setInfo] = useState<{
    base: number
    currentOverride: number | null
    available: number
  } | null>(null)
  const [_, startTransition] = useTransition()

  useEffect(() => {
    if (!selectedUserId || !selectedTypeId || !year) {
      setInfo(null)
      return
    }
    startTransition(() => {
      getLeaveBalances(selectedUserId, parseInt(year))
        .then((balances) => {
          const b = balances.find((x) => x.leaveTypeId === selectedTypeId)
          if (b) {
            setInfo({
              base: b.entitlement,
              currentOverride: b.entitlementOverride,
              available: b.available,
            })
            setOverride(b.entitlementOverride !== null ? String(b.entitlementOverride) : '')
          } else {
            setInfo(null)
          }
        })
        .catch(() => setInfo(null))
    })
  }, [selectedUserId, selectedTypeId, year])

  return (
    <form action={formAction} className="space-y-4">
      {state.success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          Entitlement updated.
        </div>
      )}
      {state.error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ov-userId">Employee *</Label>
          <select
            id="ov-userId"
            name="userId"
            required
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            <option value="">Select employee</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName} ({u.email})
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="ov-leaveTypeId">Leave Type *</Label>
          <select
            id="ov-leaveTypeId"
            name="leaveTypeId"
            required
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            <option value="">Select type</option>
            {leaveTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="ov-year">Year *</Label>
          <select
            id="ov-year"
            name="year"
            required
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="entitlementOverride">
            Base entitlement (days)
            {info && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {info.currentOverride !== null
                  ? `Override set to ${info.currentOverride} (auto would be ${info.base})`
                  : `Auto-calculated: ${info.base}`}
              </span>
            )}
          </Label>
          <Input
            id="entitlementOverride"
            name="entitlementOverride"
            type="number"
            min="0"
            step="0.5"
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            placeholder="Leave blank to clear override and use auto"
            className="mt-1"
          />
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sets this employee&apos;s base for the year. Blank = clear override and fall back to
            the system-calculated value.
          </p>
        </div>
      </div>

      <div>
        <Label htmlFor="ov-reason">Reason *</Label>
        <Input
          id="ov-reason"
          name="reason"
          type="text"
          required
          placeholder="e.g. HR provided current count for 2026"
          className="mt-1"
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save Entitlement'}
        </Button>
      </div>
    </form>
  )
}
