'use client'

import { useActionState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { importLeaveCsv, type ImportState } from '@/actions/leaveImport'

const initialState: ImportState = {}

export function CsvImportForm() {
  const [state, formAction, isPending] = useActionState(importLeaveCsv, initialState)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      )}

      {/* Results */}
      {(state.imported !== undefined || state.skipped !== undefined) && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          <p className="font-medium">Import complete:</p>
          <p>{state.imported ?? 0} records imported, {state.skipped ?? 0} duplicates skipped.</p>
        </div>
      )}

      {/* Errors list */}
      {state.errors && state.errors.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="mb-2 text-sm font-medium text-amber-700">Row errors ({state.errors.length}):</p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {state.errors.map((err, i) => (
              <p key={i} className="text-xs text-amber-700">{err}</p>
            ))}
          </div>
        </div>
      )}

      {/* File input */}
      <div>
        <Label htmlFor="csv">CSV File *</Label>
        <input
          ref={fileRef}
          id="csv"
          name="csv"
          type="file"
          accept=".csv"
          required
          className="mt-1 block w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:font-medium hover:file:bg-muted/80 focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
        />
      </div>

      {/* Expected format info */}
      <div className="rounded-lg bg-muted/20 border border-border p-3">
        <p className="text-xs font-medium text-muted-foreground mb-1">Expected CSV columns:</p>
        <code className="text-xs text-foreground/70">
          employee_email, leave_type, start_date, end_date, days, status, approved_by_email, year
        </code>
        <p className="mt-2 text-xs text-muted-foreground">
          Dates format: YYYY-MM-DD. Status field is informational only — all imported records are saved as APPROVED.
          Duplicate rows (same email + type + start + end) are automatically skipped.
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Importing...' : 'Import CSV'}
        </Button>
      </div>
    </form>
  )
}
