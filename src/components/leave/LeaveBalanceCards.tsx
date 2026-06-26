'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type LeaveBalance = {
  id: string
  leaveTypeId: string
  year: number
  entitlement: number
  entitlementOverride: number | null
  used: number
  pending: number
  carryForward: number
  carryForwardExpiresAt: Date | string | null
  adjustment: number
  available: number
  leaveType: {
    name: string
    defaultEntitlement: number
  }
}

type Props = {
  balances: LeaveBalance[]
}

function formatExpiry(value: Date | string | null): string | null {
  if (!value) return null
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function LeaveBalanceCards({ balances }: Props) {
  if (balances.length === 0) {
    return (
      <div className="rounded-xl bg-card p-12 text-center ring-1 ring-foreground/10">
        <p className="text-muted-foreground">No leave balances found for this year.</p>
      </div>
    )
  }

  const now = new Date()

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {balances.map((balance) => {
        const isUnlimited = balance.leaveType.defaultEntitlement === 0
        const effectiveBase = balance.entitlementOverride ?? balance.entitlement
        const expiresAt = balance.carryForwardExpiresAt
          ? typeof balance.carryForwardExpiresAt === 'string'
            ? new Date(balance.carryForwardExpiresAt)
            : balance.carryForwardExpiresAt
          : null
        const carryActive =
          balance.carryForward > 0 && (!expiresAt || expiresAt.getTime() >= now.getTime())
        const carryExpired =
          balance.carryForward > 0 && !!expiresAt && expiresAt.getTime() < now.getTime()
        const total = effectiveBase + (carryActive ? balance.carryForward : 0) + balance.adjustment

        const availableColor = isUnlimited
          ? 'text-foreground'
          : balance.available > 0
          ? 'text-emerald-600'
          : 'text-rose-600'

        return (
          <Card key={balance.id} size="sm">
            <CardHeader>
              <CardTitle className="truncate text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {balance.leaveType.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className={`text-2xl font-bold leading-none ${availableColor}`}>
                {isUnlimited ? <span className="text-base">No limit</span> : balance.available}
              </div>
              {!isUnlimited && <p className="text-xs text-muted-foreground">of {total} days</p>}

              <p className="text-xs text-muted-foreground">
                Used: {balance.used} {balance.used === 1 ? 'day' : 'days'}
              </p>

              {balance.pending > 0 && (
                <p className="text-xs font-medium text-amber-600">
                  Pending: {balance.pending} {balance.pending === 1 ? 'day' : 'days'}
                </p>
              )}

              {carryActive && (
                <p className="text-xs text-cyan-500">
                  +{balance.carryForward} carried
                  {expiresAt && (
                    <span className="text-muted-foreground">
                      {' '}
                      · expires {formatExpiry(expiresAt)}
                    </span>
                  )}
                </p>
              )}

              {carryExpired && (
                <p className="text-xs text-muted-foreground italic">
                  {balance.carryForward} carry expired {formatExpiry(expiresAt)}
                </p>
              )}

              {balance.entitlementOverride !== null && (
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                  HR-set base
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
