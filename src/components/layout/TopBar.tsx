'use client'

import { usePathname } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { User, LogOut } from 'lucide-react'
import { logout } from '@/actions/auth'
import { NotificationBell } from '@/components/layout/NotificationBell'

interface TopBarProps {
  user: {
    name: string
    email: string
    initials: string
  }
  /** Server-rendered so the badge is right on first paint. */
  unreadCount: number
}

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/people': 'People',
  '/team-calendar': 'Team Calendar',
  '/leave': 'Time Off',
  '/documents': 'Documents',
  '/holidays': 'Holidays',
  '/time': 'Timesheet',
  '/time/approvals': 'Time Approvals',
  '/payroll': 'Payroll',
  '/rewards': 'Rewards',
  '/rewards/cycles': 'Reward Cycles',
  '/admin/work-passes': 'Work Passes',
  '/admin/blackouts': 'Blackout Windows',
  '/performance': 'Performance',
  '/performance/cycles': 'Review Cycles',
  '/performance/team': 'Team Reviews',
  '/performance/me': 'My Reviews',
}

function getPageTitle(pathname: string): string {
  // Exact match first
  if (pageTitles[pathname]) return pageTitles[pathname]
  // Prefix match for nested routes
  for (const [path, title] of Object.entries(pageTitles)) {
    if (pathname.startsWith(path)) return title
  }
  return 'Dashboard'
}

export function TopBar({ user, unreadCount }: TopBarProps) {
  const pathname = usePathname()
  const title = getPageTitle(pathname)

  return (
    <header className="flex h-14 items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="md:hidden -ml-1" />
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>

      <div className="flex items-center gap-1">
      <NotificationBell initialUnreadCount={unreadCount} />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none" />
          }
        >
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {user.initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <form action={logout}>
            <DropdownMenuItem variant="destructive" nativeButton render={<button type="submit" />}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </header>
  )
}
