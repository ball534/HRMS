'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateUser, type UpdateUserState } from '@/actions/users'

type User = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  dateOfBirth?: string | null
  nationality?: string | null
  position?: string | null
  department?: string | null
  employmentType: string
  country: string
  startDate?: string | null
  reportingManagerId?: string | null
  role: string
  status: string
}

type Manager = {
  id: string
  firstName: string
  lastName: string
}

type Props = {
  user: User
  managers: Manager[]
  onClose: () => void
}

const initialState: UpdateUserState = {}

export function EditEmployeeForm({ user, managers, onClose }: Props) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(updateUser, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success('Employee updated successfully')
      onClose()
      router.refresh()
    }
  }, [state.success, onClose, router])

  // Format date for input[type=date]
  const formatDateForInput = (iso: string | null | undefined) => {
    if (!iso) return ''
    return iso.slice(0, 10)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-card p-6 ring-1 ring-foreground/10 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit Employee</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {state.error && (
          <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={user.id} />

          {/* Status — prominent at top */}
          <div className="rounded-lg border border-border bg-muted/10 p-4">
            <Label htmlFor="status" className="text-sm font-medium">Employment Status</Label>
            <select
              id="status"
              name="status"
              defaultValue={user.status}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="TERMINATED">Terminated</option>
            </select>
            {state.errors?.status && (
              <p className="mt-1 text-xs text-rose-600">{state.errors.status[0]}</p>
            )}
          </div>

          {/* Name */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName">First Name *</Label>
              <Input id="firstName" name="firstName" defaultValue={user.firstName} required className="mt-1" />
              {state.errors?.firstName && (
                <p className="mt-1 text-xs text-rose-600">{state.errors.firstName[0]}</p>
              )}
            </div>
            <div>
              <Label htmlFor="lastName">Last Name *</Label>
              <Input id="lastName" name="lastName" defaultValue={user.lastName} required className="mt-1" />
              {state.errors?.lastName && (
                <p className="mt-1 text-xs text-rose-600">{state.errors.lastName[0]}</p>
              )}
            </div>
          </div>

          {/* Email */}
          <div>
            <Label htmlFor="email">Email *</Label>
            <Input id="email" name="email" type="email" defaultValue={user.email} required className="mt-1" />
            {state.errors?.email && (
              <p className="mt-1 text-xs text-rose-600">{state.errors.email[0]}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={user.phone ?? ''} className="mt-1" />
          </div>

          {/* Role & Employment Type */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="role">Role *</Label>
              <select
                id="role"
                name="role"
                defaultValue={user.role}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
              >
                <option value="ADMIN">Admin</option>
                <option value="HR">HR</option>
                <option value="MANAGER">Manager</option>
                <option value="EMPLOYEE">Employee</option>
                <option value="CONTRACTOR">Contractor</option>
              </select>
            </div>
            <div>
              <Label htmlFor="employmentType">Employment Type *</Label>
              <select
                id="employmentType"
                name="employmentType"
                defaultValue={user.employmentType}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="CONTRACTOR">Contractor</option>
                <option value="PART_TIME">Part-time</option>
              </select>
            </div>
          </div>

          {/* Position & Department */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="position">Position</Label>
              <Input id="position" name="position" defaultValue={user.position ?? ''} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="department">Department</Label>
              <Input id="department" name="department" defaultValue={user.department ?? ''} className="mt-1" />
            </div>
          </div>

          {/* Country */}
          <div>
            <Label htmlFor="country">Country *</Label>
            <select
              id="country"
              name="country"
              defaultValue={user.country}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
            >
              <option value="SG">Singapore</option>
              <option value="MY">Malaysia</option>
            </select>
          </div>

          {/* Dates */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={formatDateForInput(user.dateOfBirth)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" name="startDate" type="date" defaultValue={formatDateForInput(user.startDate)} className="mt-1" />
            </div>
          </div>

          {/* Nationality */}
          <div>
            <Label htmlFor="nationality">Nationality</Label>
            <Input id="nationality" name="nationality" defaultValue={user.nationality ?? ''} className="mt-1" />
          </div>

          {/* Reporting Manager */}
          <div>
            <Label htmlFor="reportingManagerId">Reporting Manager</Label>
            <select
              id="reportingManagerId"
              name="reportingManagerId"
              defaultValue={user.reportingManagerId ?? ''}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
            >
              <option value="">None</option>
              {managers
                .filter(m => m.id !== user.id)
                .map(m => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </option>
                ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
