'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { verifySession } from '@/lib/dal'

/**
 * Reads and writes for the header inbox. Everything here is scoped to the
 * caller's own `userId` — there is no way to read someone else's notifications
 * through these actions.
 */

export type NotificationItem = {
  id: string
  type: string
  title: string
  body: string
  linkUrl: string | null
  read: boolean
  createdAt: string
}

const INBOX_PAGE_SIZE = 30

export async function getMyNotifications(limit = INBOX_PAGE_SIZE): Promise<NotificationItem[]> {
  const session = await verifySession()

  const rows = await db.notification.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  })

  return rows.map(r => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    linkUrl: r.linkUrl,
    read: r.readAt !== null,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function getUnreadNotificationCount(): Promise<number> {
  const session = await verifySession()
  return db.notification.count({
    where: { userId: session.userId, readAt: null },
  })
}

export async function markNotificationRead(id: string): Promise<{ success: boolean }> {
  const session = await verifySession()

  // Scoped update — passing someone else's id affects nothing.
  await db.notification.updateMany({
    where: { id, userId: session.userId, readAt: null },
    data: { readAt: new Date() },
  })

  revalidatePath('/dashboard')
  return { success: true }
}

export async function markAllNotificationsRead(): Promise<{ success: boolean; count: number }> {
  const session = await verifySession()

  const res = await db.notification.updateMany({
    where: { userId: session.userId, readAt: null },
    data: { readAt: new Date() },
  })

  revalidatePath('/dashboard')
  return { success: true, count: res.count }
}
