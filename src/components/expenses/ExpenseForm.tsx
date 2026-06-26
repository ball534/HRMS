'use client'

import { useActionState, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleExpenseAction, type ExpenseActionState } from '@/actions/expense'
import { CURRENCIES, EXPENSE_CATEGORIES } from '@/lib/expense-constants'
import { ReceiptUploader, type UploadedReceipt } from './ReceiptUploader'

type ExistingExpense = {
  id: string
  category: string
  amount: string
  currency: string
  merchant: string
  receiptDate: string
  description?: string | null
  receipts: Array<{ id: string; fileName: string; mimeType: string; url?: string }>
}

type ExpenseFormProps = {
  expense?: ExistingExpense
}

const initialState: ExpenseActionState = {}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

export function ExpenseForm({ expense }: ExpenseFormProps) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(handleExpenseAction, initialState)
  const [receipts, setReceipts] = useState<UploadedReceipt[]>([])
  const intentRef = useRef<HTMLInputElement>(null)

  // Redirect to expense list on success
  useEffect(() => {
    if (state.success) {
      const intent = intentRef.current?.value
      if (intent === 'submit') {
        toast.success('Expense submitted for approval')
      } else {
        toast.success('Expense saved as draft')
      }
      router.push('/expenses')
    }
  }, [state.success, router])

  const isEdit = !!expense

  return (
    <form action={formAction} className="space-y-6">
      {/* Hidden fields */}
      <input type="hidden" name="intent" ref={intentRef} defaultValue="draft" />
      <input type="hidden" name="receipts" value={JSON.stringify(receipts)} />
      {isEdit && <input type="hidden" name="expenseId" value={expense.id} />}

      {/* Error */}
      {state.error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      )}

      {/* Category */}
      <div>
        <Label htmlFor="category">Category *</Label>
        <select
          id="category"
          name="category"
          required
          defaultValue={expense?.category ?? ''}
          className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
        >
          <option value="">Select category</option>
          {EXPENSE_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Amount + Currency */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="amount">Amount *</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step="any"
            min="0.01"
            inputMode="decimal"
            required
            defaultValue={expense?.amount ?? ''}
            placeholder="0.00"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="currency">Currency *</Label>
          <select
            id="currency"
            name="currency"
            required
            defaultValue={expense?.currency ?? 'SGD'}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            {CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Merchant */}
      <div>
        <Label htmlFor="merchant">Merchant *</Label>
        <Input
          id="merchant"
          name="merchant"
          type="text"
          required
          defaultValue={expense?.merchant ?? ''}
          placeholder="e.g. Grab, Starbucks, Amazon"
          className="mt-1"
        />
      </div>

      {/* Receipt Date */}
      <div>
        <Label htmlFor="receiptDate">Receipt Date *</Label>
        <Input
          id="receiptDate"
          name="receiptDate"
          type="date"
          required
          defaultValue={expense?.receiptDate ?? todayIso()}
          max={todayIso()}
          className="mt-1"
        />
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={expense?.description ?? ''}
          placeholder="Optional details about this expense"
          className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
        />
      </div>

      {/* Receipts */}
      <div>
        <Label>Receipts</Label>
        <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
          Upload photos or PDFs of your receipts. Files upload directly to secure storage.
        </p>
        <ReceiptUploader
          receipts={receipts}
          onReceiptsChange={setReceipts}
          existingReceipts={expense?.receipts}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/expenses')}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="outline"
          disabled={isPending}
          onClick={() => { if (intentRef.current) intentRef.current.value = 'draft' }}
        >
          {isPending ? 'Saving...' : 'Save as Draft'}
        </Button>
        <Button
          type="submit"
          disabled={isPending}
          onClick={() => { if (intentRef.current) intentRef.current.value = 'submit' }}
        >
          {isPending ? 'Submitting...' : 'Submit for Approval'}
        </Button>
      </div>
    </form>
  )
}
