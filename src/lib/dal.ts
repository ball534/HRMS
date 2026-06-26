import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export type VerifiedSession = {
  isAuth: boolean
  userId: string
  role: string
  mustChangePassword: boolean
}

export const verifySession = cache(async (): Promise<VerifiedSession> => {
  const session = await getSession()

  if (!session || !session.userId) {
    redirect('/login')
  }

  return {
    isAuth: true,
    userId: session.userId,
    role: session.role,
    mustChangePassword: session.mustChangePassword,
  }
})

export async function requireRole(allowedRoles: string[]): Promise<VerifiedSession> {
  const session = await verifySession()

  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard')
  }

  return session
}
