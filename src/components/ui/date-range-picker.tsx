"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DateRangePickerProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  className?: string
  disabled?: boolean
}

export function DateRangePicker({
  value,
  onChange,
  className,
  disabled,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            disabled={disabled}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 py-1 text-sm transition-colors",
              "hover:bg-accent/50 focus-visible:border-ring focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50",
              !value?.from && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        {value?.from ? (
          value.to ? (
            <span>
              {format(value.from, "dd/MM/yyyy")} – {format(value.to, "dd/MM/yyyy")}
            </span>
          ) : (
            <span>{format(value.from, "dd/MM/yyyy")} – Select end date</span>
          )
        ) : (
          <span>Pick a date range</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={value?.from || new Date()}
          selected={value}
          onSelect={(range) => {
            onChange(range)
            // Close popover when both dates are selected
            if (range?.from && range?.to) {
              setTimeout(() => setOpen(false), 200)
            }
          }}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
}
