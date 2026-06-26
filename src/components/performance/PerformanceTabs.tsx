'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type Props = {
  isAdmin: boolean
  hasTeam: boolean
}

export function PerformanceTabs({ isAdmin, hasTeam }: Props) {
  const pathname = usePathname()

  const tabs: { href: string; label: string; match: (p: string) => boolean }[] = []
  if (isAdmin) {
    tabs.push({
      href: '/performance/cycles',
      label: 'Cycles',
      match: (p) => p.startsWith('/performance/cycles'),
    })
  }
  if (hasTeam) {
    tabs.push({
      href: '/performance/team',
      label: 'My team',
      match: (p) => p.startsWith('/performance/team'),
    })
  }
  tabs.push({
    href: '/performance/me',
    label: 'My reviews',
    match: (p) => p.startsWith('/performance/me'),
  })

  // The /performance/[id] route — highlight whichever tab the viewer most likely
  // came from. Default to "My team" if they manage anyone, else "My reviews".
  const isDetail =
    pathname.startsWith('/performance/') &&
    !pathname.startsWith('/performance/cycles') &&
    !pathname.startsWith('/performance/team') &&
    !pathname.startsWith('/performance/me') &&
    pathname !== '/performance'

  if (tabs.length <= 1 && !isAdmin) return null

  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((t) => {
        const active = isDetail
          ? t.href === (hasTeam ? '/performance/team' : '/performance/me')
          : t.match(pathname)
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
