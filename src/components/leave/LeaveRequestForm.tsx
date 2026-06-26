'use client'

import { useActionState, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { toast } from 'sonner'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { submitLeaveRequest, previewWorkingDays, type LeaveActionState, type PreviewResult } from '@/actions/leave'

type LeaveType = {
  id: string
  name: string
  requiresAttachment: boolean
  allowsHalfDay: boolean
  defaultEntitlement: number
}

type Props = {
  leaveTypes: LeaveType[]
}

const initialState: LeaveActionState = {}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function LeaveRequestForm({ leaveTypes }: Props) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(submitLeaveRequest, initialState)

  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [halfDay, setHalfDay] = useState<'NONE' | 'AM' | 'PM'>('NONE')
  const [fileError, setFileError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const selectedType = leaveTypes.find(t => t.id === selectedTypeId) ?? null

  // Format dates for the server action (YYYY-MM-DD)
  const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : ''
  const endDate = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : ''

  // Debounce to avoid calling server on every keystroke
  const debouncedStart = useDebounce(startDate, 400)
  const debouncedEnd = useDebounce(endDate, 400)
  const debouncedTypeId = useDebounce(selectedTypeId, 200)
  const debouncedHalfDay = useDebounce(halfDay, 200)

  const fetchPreview = useCallback(async () => {
    if (!debouncedTypeId || !debouncedStart || !debouncedEnd) {
      setPreview(null)
      return
    }
    setPreviewLoading(true)
    try {
      const result = await previewWorkingDays(debouncedTypeId, debouncedStart, debouncedEnd, debouncedHalfDay)
      setPreview(result)
    } finally {
      setPreviewLoading(false)
    }
  }, [debouncedTypeId, debouncedStart, debouncedEnd, debouncedHalfDay])

  useEffect(() => {
    fetchPreview()
  }, [fetchPreview])

  // Redirect on success
  useEffect(() => {
    if (state.success) {
      toast.success('Leave request submitted successfully')
      router.push('/leave')
    }
  }, [state.success, router])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file && file.size > MAX_FILE_SIZE) {
      setFileError('File size must be under 10MB')
      e.target.value = ''
    } else {
      setFileError(null)
    }
  }

  const isInsufficientBalance =
    preview !== null &&
    !preview.unlimited &&
    !preview.sufficient &&
    preview.daysCount > 0

  const isZeroDays = preview !== null && preview.daysCount === 0 && startDate && endDate

  const canSubmit =
    !isPending &&
    !isInsufficientBalance &&
    !isZeroDays &&
    !fileError &&
    selectedTypeId &&
    startDate &&
    endDate

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      )}

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
          <option value="">Select leave type</option>
          {leaveTypes.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Date Range Picker */}
      <div>
        <Label>Time Off Days *</Label>
        <div className="mt-1">
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />
        </div>
        {/* Hidden inputs for form submission */}
        <input type="hidden" name="startDate" value={startDate} />
        <input type="hidden" name="endDate" value={endDate} />
      </div>

      {/* Half Day (only when leave type allows it) */}
      {selectedType?.allowsHalfDay && (
        <div>
          <Label htmlFor="halfDay">Duration</Label>
          <select
            id="halfDay"
            name="halfDay"
            value={halfDay}
            onChange={e => setHalfDay(e.target.value as 'NONE' | 'AM' | 'PM')}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
          >
            <option value="NONE">Full day(s)</option>
            <option value="AM">Morning (AM)</option>
            <option value="PM">Afternoon (PM)</option>
          </select>
        </div>
      )}
      {/* Hidden halfDay when not shown */}
      {!selectedType?.allowsHalfDay && (
        <input type="hidden" name="halfDay" value="NONE" />
      )}

      {/* Reason */}
      <div>
        <Label htmlFor="reason">Remarks</Label>
        <textarea
          id="reason"
          name="reason"
          rows={3}
          placeholder="Optional reason for your request"
          className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
        />
      </div>

      {/* Attachment */}
      <div>
        <Label htmlFor="attachment">
          Attachment{selectedType?.requiresAttachment && (
            <span className="ml-1 text-rose-600">*</span>
          )}
        </Label>
        {selectedType?.requiresAttachment && (
          <p className="mt-0.5 text-xs text-rose-600">
            A supporting document is required for {selectedType.name}.
          </p>
        )}
        <Input
          id="attachment"
          name="attachment"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={handleFileChange}
          className="mt-1"
        />
        {fileError && (
          <p className="mt-0.5 text-xs text-rose-600">{fileError}</p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">Max 10MB. PDF, JPG, PNG, DOC accepted.</p>
      </div>

      {/* Live preview */}
      {(startDate && endDate && selectedTypeId) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          isZeroDays
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : isInsufficientBalance
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-border bg-muted/20 text-muted-foreground'
        }`}>
          {previewLoading ? (
            <span>Calculating working days...</span>
          ) : preview === null ? null : isZeroDays ? (
            <span>No working days in selected range.</span>
          ) : (
            <>
              <span className="font-medium text-foreground">
                {preview.daysCount} working {preview.daysCount === 1 ? 'day' : 'days'} will be deducted.
              </span>
              {preview.unlimited ? (
                <span className="ml-2">Balance: No limit.</span>
              ) : (
                <>
                  <span className="ml-2">
                    Balance: {preview.available} {preview.available === 1 ? 'day' : 'days'} remaining.
                  </span>
                  {isInsufficientBalance && (
                    <p className="mt-1 font-medium text-rose-700">
                      Insufficient balance. Available: {preview.available} days, requested: {preview.daysCount} days.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/leave')}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {isPending ? 'Submitting...' : 'Submit Request'}
        </Button>
      </div>
    </form>
  )
}
