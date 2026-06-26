'use client'

import { useActionState, useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { adjustBalance, getLeaveBalances, type AdjustBalanceState } from '@/actions/leaveBalance'

type User = {
  id: string
  firstName: string
  lastName: string
  email: string
}

type LeaveType = {
  id: string
  name: string
}

type Props = {
  users: User[]
  leaveTypes: LeaveType[]
}

const initialState: AdjustBalanceState = {}

const currentYear = new Date().getFullYear()
const YEARS = [currentYear - 1, currentYear, currentYear + 1]

export function BalanceAdjustForm({ users, leaveTypes }: Props) {
  const [state, formAction, isPending] = useActionState(adjustBalance, initialState)

  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [year, setYear] = useState(currentYear.toString())
  const [currentBalance, setCurrentBalance] = useState<number | null>(null)

  // Fetch current balance when user/type/year changes
  useEffect(() => {
    if (!selectedUserId || !selectedTypeId || !year) {
      setCurrentBalance(null)
      return
    }

    getLeaveBalances(selectedUserId, parseInt(year))
      .then(balances => {
        const b = balances.find(b => b.leaveTypeId === selectedTypeId)
        if (b) {
          setCurrentBalance(b.available)
        } else {
          setCurrentBalance(null)
        }
      })
      .catch(() => setCurrentBalance(null))
  }, [selectedUserId, selectedTypeId, year])

  return (
    <form action={formAction} className="space-y-4">
      {state.success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          Balance adjusted successfully.
        </div>
      )}
      {state.error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* User */}
        <div>
          <Label htmlFor="userId">Employee *</Label>
          <select
            id="userId"
            name="userId"
            required
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            <option value="">Select employee</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName} ({u.email})
              </option>
            ))}
          </select>
        </div>

        {/* Leave Type */}
        <div>
          <Label htmlFor="leaveTypeId">Leave Type *</Label>
          <select
            id="leaveTypeId"
            name="leaveTypeId"
            required
            value={selectedTypeId}
            onChange={e => setSelectedTypeId(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            <option value="">Select type</option>
            {leaveTypes.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Year */}
        <div>
          <Label htmlFor="year">Year *</Label>
          <select
            id="year"
            name="year"
            required
            value={year}
            onChange={e => setYear(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            {YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Adjustment delta */}
        <div>
          <Label htmlFor="adjustmentDelta">
            Adjustment (days) *
            {currentBalance !== null && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                Current available: {currentBalance}
              </span>
            )}
          </Label>
          <Input
            id="adjustmentDelta"
            name="adjustmentDelta"
            type="number"
            step="0.5"
            required
            placeholder="e.g. 2 or -1"
            className="mt-1"
          />
          <p className="mt-0.5 text-xs text-muted-foreground">
            Positive = add days. Negative = deduct days.
          </p>
        </div>
      </div>

      {/* Reason */}
      <div>
        <Label htmlFor="reason">Reason *</Label>
        <Input
          id="reason"
          name="reason"
          type="text"
          required
          placeholder="e.g. Correction for medical leave overage"
          className="mt-1"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Adjusting...' : 'Adjust Balance'}
        </Button>
      </div>
    </form>
  )
}
