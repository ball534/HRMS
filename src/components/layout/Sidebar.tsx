'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Calendar,
  Clock,
  Receipt,
  CalendarDays,
  CheckSquare,
  FolderOpen,
  Lock,
  Settings,
  Target,
  Timer,
  Gift,
  IdCard,
  GraduationCap,
  LineChart,
  FileSignature,
  CircleUserRound,
} from 'lucide-react'
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from '@/components/ui/sidebar'

type Props = {
  role: string
  userId: string
  isPartTime: boolean
  hasDirectReports: boolean
}

export function Sidebar({ role, userId, isPartTime, hasDirectReports }: Props) {
  const pathname = usePathname()
  const isAdmin = role === 'ADMIN'

  const sections: { label?: string; items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = []

  // Dashboard always
  sections.push({ items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] })

  // HR section
  const hrItems: typeof sections[0]['items'] = [
    { href: `/people/${userId}`, label: 'My Profile', icon: CircleUserRound },
    { href: '/people', label: 'People', icon: Users },
    { href: '/team-calendar', label: 'Team Calendar', icon: Calendar },
    { href: '/leave', label: 'Time Off', icon: Clock },
  ]
  // Timesheet: visible to part-timers and to admins/managers (for approvals access)
  if (isPartTime || isAdmin || hasDirectReports) {
    hrItems.push({ href: '/time', label: 'Timesheet', icon: Timer })
  }
  hrItems.push({ href: '/performance', label: 'Performance', icon: Target })
  hrItems.push({ href: '/documents', label: 'Documents', icon: FolderOpen })
  hrItems.push({ href: '/learning', label: 'Learning', icon: GraduationCap })
  sections.push({ label: 'HR', items: hrItems })

  // Admin section
  if (isAdmin) {
    sections.push({
      label: 'ADMIN',
      items: [
        { href: '/holidays', label: 'Holidays', icon: CalendarDays },
        { href: '/admin/leave', label: 'Leave Management', icon: Settings },
        { href: '/admin/blackouts', label: 'Blackout Windows', icon: CalendarDays },
        { href: '/admin/letters', label: 'Letters', icon: FileSignature },
        { href: '/admin/work-passes', label: 'Work Passes', icon: IdCard },
        { href: '/payroll', label: 'Payroll', icon: Receipt },
        { href: '/rewards/cycles', label: 'Rewards', icon: Gift },
        { href: '/admin/learning', label: 'Learning Progress', icon: LineChart },
      ],
    })
  }

  return (
    <ShadcnSidebar>
      <SidebarHeader className="px-5 py-5">
        <Link href="/dashboard" className="flex items-center">
          <span className="text-base font-bold text-sidebar-accent-foreground">InsideHR</span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3">
        {sections.map((section, sIdx) => (
          <div key={sIdx} className={sIdx > 0 ? 'mt-5' : ''}>
            {section.label && (
              <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/60">
                {section.label}
              </div>
            )}
            <SidebarMenu>
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : item.href === '/people'
                      ? pathname.startsWith('/people') && pathname !== `/people/${userId}`
                      : pathname.startsWith(item.href)

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      render={
                        <Link href={item.href}>
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <Link href="/change-password">
                  <Lock className="h-4 w-4" />
                  <span>Change Password</span>
                </Link>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </ShadcnSidebar>
  )
}
