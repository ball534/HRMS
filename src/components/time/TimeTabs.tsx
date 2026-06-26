'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type Props = {
  isPartTime: boolean
  hasTeam: boolean
  isAdmin: boolean
}

export function TimeTabs({ isPartTime, hasTeam, isAdmin }: Props) {
  const pathname = usePathname()

  const tabs: { href: string; label: string; match: (p: string) => boolean }[] = []
  if (isPartTime) {
    tabs.push({
      href: '/time',
      label: 'My timesheet',
      match: (p) => p === '/time',
    })
  }
  if (hasTeam) {
    tabs.push({
      href: '/time/approvals',
      label: 'Approvals',
      match: (p) => p.startsWith('/time/approvals'),
    })
  }
  if (isAdmin) {
    tabs.push({
      href: '/payroll',
      label: 'Payroll',
      match: (p) => p.startsWith('/payroll'),
    })
  }

  if (tabs.length <= 1) return null

  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((t) => {
        const active = t.match(pathname)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
