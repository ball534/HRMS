'use client'

import { Cake } from 'lucide-react'
import { format } from 'date-fns'

type BirthdayEntry = {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string
}

type Props = {
  birthdays: BirthdayEntry[]
}

export function BirthdayWidget({ birthdays }: Props) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="mb-3 flex items-center gap-2">
        <Cake className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Team Birthdays</h3>
      </div>

      {birthdays.length === 0 ? (
        <p className="text-sm text-muted-foreground">No team birthdays this month</p>
      ) : (
        <div className="space-y-2">
          {birthdays.map((person) => {
            const date = new Date(person.dateOfBirth)
            return (
              <div key={person.id} className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {person.firstName} {person.lastName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(date, 'MMM d')}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
