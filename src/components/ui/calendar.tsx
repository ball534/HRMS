"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import "react-day-picker/style.css"
import { cn } from "@/lib/utils"

function Calendar({
  className,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <div className={cn("[&_.rdp-root]:text-foreground [&_.rdp-day_button]:text-foreground [&_.rdp-selected_.rdp-day_button]:bg-primary [&_.rdp-selected_.rdp-day_button]:text-primary-foreground [&_.rdp-today:not(.rdp-selected)_.rdp-day_button]:bg-accent [&_.rdp-chevron]:fill-foreground [&_.rdp-range_middle_.rdp-day_button]:bg-primary/20 [&_.rdp-outside_.rdp-day_button]:text-muted-foreground/40", className)}>
      <DayPicker
        showOutsideDays
        {...props}
      />
    </div>
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
