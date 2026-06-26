'use client'

import { formatCurrency } from '@/lib/expense-constants'

type CurrencyAmountProps = {
  amount: string
  currency: string
  className?: string
}

export function CurrencyAmount({ amount, currency, className }: CurrencyAmountProps) {
  return (
    <span className={className}>
      {formatCurrency(amount, currency)}
    </span>
  )
}
