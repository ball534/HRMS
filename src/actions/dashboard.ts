'use server'

import { db } from '@/lib/db'

export type BirthdayEntry = {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string // ISO string for serialization boundary
}

export type DashboardData = {
  user: {
    firstName: string
    lastName: string
    country: string
  } | null
  pendingLeaveCount: number
  pendingExpenseCount: number
  birthdays: BirthdayEntry[]
}

export async function getDashboardData(
  userId: string,
  role: string
): Promise<DashboardData> {
  const [user, pendingLeaveCount, pendingExpenseCount, allUsers] =
    await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, country: true },
      }),
      db.leaveRequest.count({
        where: { approverId: userId, status: 'PENDING' },
      }),
      role === 'ADMIN'
        ? db.expense.count({ where: { status: 'FOR_APPROVAL' } })
        : Promise.resolve(0),
      db.user.findMany({
        where: { status: 'ACTIVE', dateOfBirth: { not: null } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
        },
      }),
    ])

  const currentMonth = new Date().getMonth() + 1
  const birthdays = allUsers
    .filter((u) => u.dateOfBirth!.getMonth() + 1 === currentMonth)
    .sort((a, b) => a.dateOfBirth!.getDate() - b.dateOfBirth!.getDate())
    .map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      dateOfBirth: u.dateOfBirth!.toISOString(),
    }))

  return {
    user: user
      ? { firstName: user.firstName, lastName: user.lastName, country: user.country }
      : null,
    pendingLeaveCount,
    pendingExpenseCount,
    birthdays,
  }
}
