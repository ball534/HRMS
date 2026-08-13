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
  ScrollText,
  Scale,
  SlidersHorizontal,
  FileText,
} from 'lucide-react'
import { can, type Capability } from '@/lib/permissions'
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

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Item is shown only if the role holds this capability. */
  capability?: Capability
}

export function Sidebar({ role, userId, isPartTime, hasDirectReports }: Props) {
  const pathname = usePathname()
  const isAdmin = role === 'ADMIN'

  const sections: { label?: string; items: NavItem[] }[] = []

  // Dashboard always
  sections.push({ items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] })

  // HR section
  const hrItems: NavItem[] = [
    { href: `/people/${userId}`, label: 'My Profile', icon: CircleUserRound },
    { href: '/people', label: 'People', icon: Users },
    { href: '/team-calendar', label: 'Team Calendar', icon: Calendar },
    { href: '/leave', label: 'Time Off', icon: Clock },
  ]
  // Approvals used to have no navigation entry at all — the only route in was a
  // dashboard card that rendered nothing once the queue was empty, so an
  // approver could never look back at what they had already actioned.
  if (hasDirectReports || can(role, 'leave.approve')) {
    hrItems.push({ href: '/approvals', label: 'Approvals', icon: CheckSquare })
  }
  // Timesheet: visible to part-timers and to admins/managers (for approvals access)
  if (isPartTime || isAdmin || hasDirectReports) {
    hrItems.push({ href: '/time', label: 'Timesheet', icon: Timer })
  }
  hrItems.push({ href: '/performance', label: 'Performance', icon: Target })
  hrItems.push({ href: '/documents', label: 'Documents', icon: FolderOpen })
  hrItems.push({ href: '/learning', label: 'Learning', icon: GraduationCap })
  sections.push({ label: 'HR', items: hrItems })

  // Administration. Every entry is gated on the capability its page requires
  // rather than on `role === 'ADMIN'`, so the HR team reaches the screens they
  // are now authorized for instead of having to borrow the admin login.
  const adminNav: NavItem[] = [
    { href: '/holidays', label: 'Holidays', icon: CalendarDays, capability: 'holidays.write' },
    { href: '/admin/leave', label: 'Leave Management', icon: Settings, capability: 'leave.admin' },
    { href: '/admin/blackouts', label: 'Blackout Windows', icon: CalendarDays, capability: 'blackouts.write' },
    { href: '/admin/letters', label: 'Letters', icon: FileSignature, capability: 'letters.read' },
    { href: '/admin/letter-templates', label: 'Letter Templates', icon: FileText, capability: 'letters.write' },
    { href: '/admin/work-passes', label: 'Work Passes', icon: IdCard, capability: 'workpass.read' },
    { href: '/payroll', label: 'Payroll', icon: Receipt, capability: 'payroll.read' },
    { href: '/rewards/cycles', label: 'Rewards', icon: Gift, capability: 'rewards.admin' },
    { href: '/admin/learning', label: 'Learning Progress', icon: LineChart, capability: 'learning.admin' },
  ]
  const adminItems = adminNav.filter(item => !item.capability || can(role, item.capability))

  if (adminItems.length) {
    sections.push({ label: 'ADMIN', items: adminItems })
  }

  // Governance — audit trail, statutory rulebook, org settings.
  const govNav: NavItem[] = [
    { href: '/admin/audit', label: 'Audit Log', icon: ScrollText, capability: 'audit.read' },
    { href: '/admin/statutory', label: 'Statutory Rules', icon: Scale, capability: 'statutory.write' },
    { href: '/admin/settings', label: 'Settings', icon: SlidersHorizontal, capability: 'settings.write' },
  ]
  const govItems = govNav.filter(item => !item.capability || can(role, item.capability))

  if (govItems.length) {
    sections.push({ label: 'GOVERNANCE', items: govItems })
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
