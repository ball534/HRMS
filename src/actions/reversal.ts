'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import {
  reverseState,
  learningLockKey,
  type ReversibleEntityType,
} from '@/lib/reversal'

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

/**
 * Reset a learner's test lockout.
 *
 * This is the capability the product has been promising and not delivering:
 * after three failed attempts the app locks the test and tells the learner, in
 * three languages, "Please contact HR, who can reset your access" — while no
 * action, API or admin screen anywhere could set `locked: false` for another
 * user. A store associate who failed Test 1 three times could not complete
 * onboarding without someone editing the database.
 */
export async function resetLearningLockout(
  userId: string,
  testId: string,
  reason: string,
): Promise<ReversalActionState> {
  const session = await verifySession()

  const result = await reverseState({
    entityType: 'LEARNING',
    entityId: learningLockKey(userId, testId),
    to: 'UNLOCKED',
    reason,
    actorId: session.userId,
    actorRole: session.role,
  })

  if (!result.success) return { error: result.error }

  revalidatePath('/admin/learning')
  return { success: true }
}
