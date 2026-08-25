import { notFound, redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { loadEmployeeProfile } from '@/lib/profileData'
import { OffboardDialog } from '@/components/people/OffboardDialog'
import { EmployeeProfile } from '@/components/people/EmployeeProfile'
import { WorkPassManager } from '@/components/people/WorkPassManager'

type Props = {
  params: Promise<{ id: string }>
}

/**
 * Somebody else's profile.
 *
 * Your own now lives on the dashboard — profile and dashboard were two screens
 * showing overlapping halves of the same thing — so landing here as yourself
 * redirects rather than rendering a second copy.
 */
export default async function PersonPage({ params }: Props) {
  const { id } = await params
  const session = await verifySession()

  if (session.userId === id) redirect('/dashboard?tab=profile')

  const data = await loadEmployeeProfile(id, session)
  if (!data) notFound()

  const canOffboard = can(session.role, 'people.offboard')

  return (
    <EmployeeProfile
      user={data.user}
      isAdmin={data.isHrView}
      isSelf={false}
      managers={data.managers}
      leaveBalances={data.leaveBalances}
      leaveRequests={data.leaveRequests}
      leaveAuditLogs={data.leaveAuditLogs}
      currentYear={data.currentYear}
      careerEvents={data.careerEvents}
      workPassSlot={
        data.isHrView ? (
          <WorkPassManager
            userId={id}
            passes={data.workPasses}
            employee={data.employeeForPass}
          />
        ) : undefined
      }
      offboardSlot={
        canOffboard && data.user.status === 'ACTIVE' ? (
          <OffboardDialog
            userId={id}
            employeeName={`${data.user.firstName} ${data.user.lastName}`}
          />
        ) : undefined
      }
    />
  )
}
