'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { createSession, deleteSession, getSession } from '@/lib/session'
import { createAuditLog } from '@/lib/audit'
import { sendPasswordResetEmail } from '@/lib/email'

// ============================================================
// Schemas
// ============================================================

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

const changePasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
})

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
})

// ============================================================
// Action return types
// ============================================================

export type AuthActionState = {
  error?: string
  fieldErrors?: Record<string, string[]>
}

// ============================================================
// login
// ============================================================

export async function login(
  _state: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const rawData = {
    email: formData.get('email'),
    password: formData.get('password'),
  }

  // Validate inputs
  const parsed = loginSchema.safeParse(rawData)
  if (!parsed.success) {
    return { error: 'Invalid credentials' }
  }

  const { email, password } = parsed.data

  try {
    // Find user by email
    const user = await db.user.findUnique({ where: { email } })

    // Generic error — don't reveal which field is wrong
    if (!user) {
      return { error: 'Invalid credentials' }
    }

    // Check user is active
    if (user.status !== 'ACTIVE') {
      return { error: 'Invalid credentials' }
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.passwordHash)
    if (!passwordMatch) {
      return { error: 'Invalid credentials' }
    }

    // Create session
    await createSession(user.id, user.role, user.mustChangePassword)

    // Create audit log
    await createAuditLog({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'USER',
      entityId: user.id,
    })
  } catch {
    return { error: 'Invalid credentials' }
  }

  // Redirect based on mustChangePassword (must be outside try/catch in Next.js)
  // We need to re-read session state since we already committed it
  // Use a separate flag approach
  let mustChangePassword = false
  try {
    const user = await db.user.findFirst({
      where: { email: (rawData.email as string) },
      select: { mustChangePassword: true },
    })
    mustChangePassword = user?.mustChangePassword ?? false
  } catch {
    // Default to dashboard
  }

  if (mustChangePassword) {
    redirect('/change-password')
  } else {
    redirect('/dashboard')
  }
}

// ============================================================
// changePassword
// ============================================================

export async function changePassword(
  _state: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const rawData = {
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  }

  // Validate inputs
  const parsed = changePasswordSchema.safeParse(rawData)
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const [key, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
      if (errors) fieldErrors[key] = errors
    }
    return { fieldErrors, error: 'Please fix the errors below' }
  }

  const { newPassword, confirmPassword } = parsed.data

  // Client-side match validation (also server-side for safety)
  if (newPassword !== confirmPassword) {
    return { error: 'Passwords do not match' }
  }

  // Get current session
  const session = await getSession()
  if (!session || !session.userId) {
    redirect('/login')
  }

  try {
    // Get current user
    const user = await db.user.findUnique({ where: { id: session.userId } })
    if (!user) {
      redirect('/login')
    }

    // Ensure new password is not the same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash)
    if (isSamePassword) {
      return { error: 'New password must be different from your current password' }
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12)

    // Update user
    await db.user.update({
      where: { id: session.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    })

    // Delete old session and create new one without mustChangePassword flag
    await deleteSession()
    await createSession(session.userId, session.role, false)

    // Create audit log
    await createAuditLog({
      userId: session.userId,
      action: 'PASSWORD_CHANGED',
      entityType: 'USER',
      entityId: session.userId,
    })
  } catch {
    return { error: 'Failed to change password. Please try again.' }
  }

  redirect('/dashboard')
}

// ============================================================
// forgotPassword
// ============================================================

export async function forgotPassword(
  _state: AuthActionState,
  formData: FormData
): Promise<AuthActionState & { success?: boolean }> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
  })

  if (!parsed.success) {
    return { error: 'Please enter a valid email address' }
  }

  const { email } = parsed.data

  try {
    const user = await db.user.findUnique({ where: { email } })

    // Always show success to prevent email enumeration
    if (!user || user.status !== 'ACTIVE') {
      return { success: true }
    }

    // Invalidate any existing tokens for this user
    await db.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    })

    // Create reset token (1 hour expiry)
    const token = crypto.randomBytes(32).toString('hex')
    await db.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    })

    // Send email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const resetUrl = `${baseUrl}/reset-password?token=${token}`
    await sendPasswordResetEmail(email, resetUrl)

    await createAuditLog({
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'USER',
      entityId: user.id,
    })
  } catch {
    // Don't reveal errors to prevent enumeration
  }

  return { success: true }
}

// ============================================================
// resetPassword
// ============================================================

export async function resetPassword(
  _state: AuthActionState,
  formData: FormData
): Promise<AuthActionState & { success?: boolean }> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get('token'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  })

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const [key, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
      if (errors) fieldErrors[key] = errors
    }
    return { fieldErrors, error: 'Please fix the errors below' }
  }

  const { token, newPassword, confirmPassword } = parsed.data

  if (newPassword !== confirmPassword) {
    return { error: 'Passwords do not match' }
  }

  try {
    // Find valid token
    const resetToken = await db.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    })

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return { error: 'This reset link is invalid or has expired. Please request a new one.' }
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12)

    // Update password and mark token as used
    await db.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, mustChangePassword: false },
    })

    await db.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    })

    await createAuditLog({
      userId: resetToken.userId,
      action: 'PASSWORD_CHANGED',
      entityType: 'USER',
      entityId: resetToken.userId,
    })
  } catch {
    return { error: 'Failed to reset password. Please try again.' }
  }

  redirect('/login?reset=success')
}

// ============================================================
// logout
// ============================================================

export async function logout(): Promise<void> {
  const session = await getSession()

  if (session?.userId) {
    try {
      await createAuditLog({
        userId: session.userId,
        action: 'LOGOUT',
        entityType: 'USER',
        entityId: session.userId,
      })
    } catch {
      // Don't block logout if audit log fails
    }
  }

  await deleteSession()
  redirect('/login')
}
