'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { reverseState, type ReversibleEntityType } from '@/lib/reversal'

export type ReversalActionState = { success?: boolean; error?: string }

/**
 * The one server action behind every "reopen / restore / unlock" button.
 *
 * Authorization, the allowed-transition check, the mandatory reason and the
 * audit row all live in `reverseState` (src/lib/reversal.ts) so no caller can
 * skip them.
 */
export async function reverseRecordState(input: {
  entityType: ReversibleEntityType
  entityId: string
  to: string
  reason: string
  /** Paths to revalidate after the change. */
  revalidate?: string[]
}): Promise<ReversalActionState> {
  const session = await verifySession()

  const result = await reverseState({
    entityType: input.entityType,
    entityId: input.entityId,
    to: input.to,
    reason: input.reason,
    actorId: session.userId,
    actorRole: session.role,
  })

  if (!result.success) return { error: result.error }

  for (const path of input.revalidate ?? []) {
    revalidatePath(path)
  }

  return { success: true }
}
