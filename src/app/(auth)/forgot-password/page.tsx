'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { forgotPassword } from '@/actions/auth'

const initialState = { error: undefined, success: undefined }

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState(forgotPassword, initialState)

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-1 text-center">
        <div className="mb-2">
          <span className="text-2xl font-bold text-primary">InsideHR</span>
        </div>
        <CardTitle className="text-xl">Forgot your password?</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state?.success ? (
          <div className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              If an account exists with that email, you&apos;ll receive a password reset link shortly.
            </p>
            <Link
              href="/login"
              className="block text-center text-sm text-primary hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                name="email"
                placeholder="you@insidehr.com"
                autoComplete="email"
                required
                disabled={isPending}
              />
            </div>

            {state?.error && (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isPending}
            >
              {isPending ? 'Sending...' : 'Send Reset Link'}
            </Button>

            <Link
              href="/login"
              className="block text-center text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
