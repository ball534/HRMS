'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Calendar,
  Receipt,
  CalendarDays,
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
  Mail,
  ScrollText,
  Scale,
  SlidersHorizontal,
  UserPlus,
  Network,
  FileCheck,
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
  isPartTime: boolean
  hasDirectReports: boolean
  /** Retail floor staff get the Learning Hub; nobody else does. */
  isRetail: boolean
}

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Item is shown only if the role holds this capability. */
  capability?: Capability
}

/**
 * Navigation, grouped by whose work it is.
 *
 * Everything used to sit under one "HR" heading — an employee checking their own
 * leave and an HR administrator maintaining the statutory rulebook read the same
 * list of links. Now an employee sees a short unheaded list of their own things,
 * a manager gains a "My team" group, and the administrative screens appear only
 * for whoever holds the capability each one needs.
 */
export function Sidebar({ role, isPartTime, hasDirectReports, isRetail }: Props) {
  const pathname = usePathname()

  const sections: { label?: string; items: NavItem[] }[] = []

  // --- Mine. No heading: for most people this is the whole sidebar. ---
  const mine: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/my-letters', label: 'My Letters', icon: Mail },
    { href: '/documents', label: 'Documents', icon: FolderOpen },
  ]
  // The timesheet is for people who are paid by the hour, and for whoever
  // administers it.
  if (isPartTime || can(role, 'time.admin')) {
    mine.push({ href: '/time', label: 'Timesheet', icon: Timer })
  }
  // The onboarding course is retail training. Everyone else has no use for it;
  // HR reaches the content through the admin screen below.
  if (isRetail) {
    mine.push({ href: '/learning', label: 'Learning', icon: GraduationCap })
  }
  sections.push({ items: mine })

  // --- My team: managers, and anyone with direct reports. ---
  const team: NavItem[] = []
  const isHrWide = can(role, 'people.read.directory')
  if (can(role, 'people.read.department') && !isHrWide) {
    team.push({ href: '/people', label: 'My Department', icon: Users })
  }
  // Managers interview for their own department, so Candidates belongs to their
  // team rather than to the HR group below (where HR's own entry lives).
  if (can(role, 'candidates.read') && !isHrWide) {
    team.push({ href: '/candidates', label: 'Candidates', icon: UserPlus })
  }
  if (hasDirectReports || can(role, 'people.read.department')) {
    team.push({ href: '/team-calendar', label: 'Team Calendar', icon: Calendar })
    team.push({ href: '/performance', label: 'Performance', icon: Target })
  }
  if (can(role, 'learning.progress.read') && !can(role, 'learning.admin')) {
    team.push({ href: '/admin/learning', label: 'Learning Progress', icon: LineChart })
  }
  if (team.length) {
    sections.push({ label: 'MY TEAM', items: team })
  }

  // --- HR. Every entry gated on the capability its page requires. ---
  const hrNav: NavItem[] = [
    // Gated on the company-wide directory rather than on `candidates.read`,
    // which managers also hold — theirs is the department-scoped entry above.
    { href: '/candidates', label: 'Candidates', icon: UserPlus, capability: 'people.read.directory' },
    { href: '/letters', label: 'Letters', icon: FileSignature, capability: 'letters.read' },
    { href: '/onboarding', label: 'Onboarding', icon: FileCheck, capability: 'documents.admin' },
    { href: '/people', label: 'People', icon: Users, capability: 'people.read.directory' },
    { href: '/people/org-chart', label: 'Org Chart', icon: Network, capability: 'people.read.directory' },
    { href: '/team-calendar', label: 'Team Calendar', icon: Calendar, capability: 'people.read.directory' },
    { href: '/performance', label: 'Performance', icon: Target, capability: 'performance.admin' },
    { href: '/admin/leave', label: 'Leave Management', icon: Settings, capability: 'leave.admin' },
    { href: '/holidays', label: 'Holidays', icon: CalendarDays, capability: 'holidays.write' },
    { href: '/admin/blackouts', label: 'Blackout Windows', icon: CalendarDays, capability: 'blackouts.write' },
    { href: '/admin/work-passes', label: 'Work Passes', icon: IdCard, capability: 'workpass.read' },
    { href: '/payroll', label: 'Payroll', icon: Receipt, capability: 'payroll.read' },
    { href: '/rewards/cycles', label: 'Rewards', icon: Gift, capability: 'rewards.admin' },
    { href: '/admin/learning', label: 'Learning', icon: LineChart, capability: 'learning.admin' },
  ]
  const hrItems = hrNav.filter(item => !item.capability || can(role, item.capability))
  if (hrItems.length) {
    sections.push({ label: 'HR', items: hrItems })
  }

  // --- Governance: audit trail, statutory rulebook, org settings. ---
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
                      ? pathname === '/people' || pathname.startsWith('/people/')
                      : pathname.startsWith(item.href)

                return (
                  <SidebarMenuItem key={`${section.label ?? 'mine'}-${item.href}`}>
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
