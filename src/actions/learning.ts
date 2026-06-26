'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { requireRole } from '@/lib/dal'

// ============================================================
// Learning (LMS) progress sync.
//
// The iORA Learning Hub (a client app mounted at /learning) is seeded from and
// syncs back to these actions, so the HRMS database is the single source of
// truth for onboarding progress. Lesson/test ids mirror the LMS course
// definitions: "lesson1".."lesson3" and "test1".."test3".
// ============================================================

const LESSON_IDS = ['lesson1', 'lesson2', 'lesson3'] as const
const TEST_IDS = ['test1', 'test2', 'test3'] as const

// ---- shapes shared with the LMS client ----

export type LearningSeed = {
  userName: string
  role: 'admin' | 'user'
  progress: Record<string, { parts: { slides?: boolean; pdf?: boolean; video?: boolean } }>
  tests: Record<
    string,
    { attempts: number; passed: boolean; bestScore: number; locked: boolean; completedAt: number | null }
  >
  survey: {
    done: boolean
    ratings: { clarity: number; pace: number; usefulness: number }
    comment: string
  }
}

// ---- validation for the snapshot the client sends back ----

const snapshotSchema = z.object({
  progress: z.record(
    z.string(),
    z.object({
      parts: z.object({
        slides: z.boolean().optional(),
        pdf: z.boolean().optional(),
        video: z.boolean().optional(),
      }),
    })
  ),
  tests: z.record(
    z.string(),
    z.object({
      attempts: z.number().int().min(0),
      passed: z.boolean(),
      bestScore: z.number().min(0).max(1),
      locked: z.boolean(),
      completedAt: z.union([z.number(), z.null()]).optional(),
    })
  ),
  survey: z.object({
    done: z.boolean(),
    ratings: z.object({
      clarity: z.number().int().min(0).max(5),
      pace: z.number().int().min(0).max(5),
      usefulness: z.number().int().min(0).max(5),
    }),
    comment: z.string().optional(),
  }),
})

// ============================================================
// getLearningSeed — initial state for the current learner
// ============================================================

export async function getLearningSeed(): Promise<LearningSeed | null> {
  const session = await getSession()
  if (!session?.userId) return null

  const [user, lessons, tests, survey] = await Promise.all([
    db.user.findUnique({
      where: { id: session.userId },
      select: { firstName: true, lastName: true, role: true },
    }),
    db.learningLessonProgress.findMany({ where: { userId: session.userId } }),
    db.learningTestProgress.findMany({ where: { userId: session.userId } }),
    db.learningSurvey.findUnique({ where: { userId: session.userId } }),
  ])

  const progress: LearningSeed['progress'] = {}
  for (const l of lessons) {
    progress[l.lessonId] = {
      parts: { slides: l.slidesDone, pdf: l.pdfDone, video: l.videoDone },
    }
  }

  const testsMap: LearningSeed['tests'] = {}
  for (const t of tests) {
    testsMap[t.testId] = {
      attempts: t.attempts,
      passed: t.passed,
      bestScore: t.bestScore,
      locked: t.locked,
      // the client does date math on this, so hand it back as a ms timestamp
      completedAt: t.completedAt ? t.completedAt.getTime() : null,
    }
  }

  return {
    userName: user ? `${user.firstName} ${user.lastName}` : 'Learner',
    role: user?.role === 'ADMIN' ? 'admin' : 'user',
    progress,
    tests: testsMap,
    survey: survey
      ? {
          done: true,
          ratings: { clarity: survey.clarity, pace: survey.pace, usefulness: survey.usefulness },
          comment: survey.comment ?? '',
        }
      : { done: false, ratings: { clarity: 0, pace: 0, usefulness: 0 }, comment: '' },
  }
}

// ============================================================
// saveLearningProgress — persist the LMS snapshot for the learner
// ============================================================

export async function saveLearningProgress(
  snapshot: unknown
): Promise<{ ok: boolean }> {
  const session = await getSession()
  if (!session?.userId) return { ok: false }

  const parsed = snapshotSchema.safeParse(snapshot)
  if (!parsed.success) return { ok: false }

  const userId = session.userId
  const { progress, tests, survey } = parsed.data

  // Existing rows so we don't keep moving completedAt forward on every sync.
  const existingLessons = await db.learningLessonProgress.findMany({
    where: { userId },
  })
  const existingByLesson = new Map(existingLessons.map((l) => [l.lessonId, l]))

  await Promise.all([
    ...LESSON_IDS.filter((id) => progress[id]).map((lessonId) => {
      const parts = progress[lessonId].parts
      const slidesDone = !!parts.slides
      const pdfDone = !!parts.pdf
      const videoDone = !!parts.video
      const allDone = slidesDone && pdfDone && videoDone
      const prior = existingByLesson.get(lessonId)
      const completedAt = allDone ? prior?.completedAt ?? new Date() : null
      return db.learningLessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: { userId, lessonId, slidesDone, pdfDone, videoDone, completedAt },
        update: { slidesDone, pdfDone, videoDone, completedAt },
      })
    }),
    ...TEST_IDS.filter((id) => tests[id]).map((testId) => {
      const t = tests[testId]
      const completedAt =
        t.completedAt != null ? new Date(t.completedAt) : null
      return db.learningTestProgress.upsert({
        where: { userId_testId: { userId, testId } },
        create: {
          userId,
          testId,
          attempts: t.attempts,
          passed: t.passed,
          bestScore: t.bestScore,
          locked: t.locked,
          completedAt,
        },
        update: {
          attempts: t.attempts,
          passed: t.passed,
          bestScore: t.bestScore,
          locked: t.locked,
          completedAt,
        },
      })
    }),
  ])

  if (survey.done) {
    await db.learningSurvey.upsert({
      where: { userId },
      create: {
        userId,
        clarity: survey.ratings.clarity,
        pace: survey.ratings.pace,
        usefulness: survey.ratings.usefulness,
        comment: survey.comment ?? null,
      },
      update: {
        clarity: survey.ratings.clarity,
        pace: survey.ratings.pace,
        usefulness: survey.ratings.usefulness,
        comment: survey.comment ?? null,
      },
    })
  }

  return { ok: true }
}

// ============================================================
// getAllLearningProgress — admin "Learning Progress" overview
// ============================================================

export type LearnerRow = {
  userId: string
  name: string
  email: string
  department: string | null
  position: string | null
  lessons: Record<string, { slides: boolean; pdf: boolean; video: boolean; complete: boolean }>
  tests: Record<string, { attempts: number; passed: boolean; bestScore: number; locked: boolean }>
  overallPct: number
  certified: boolean
}

export async function getAllLearningProgress(): Promise<LearnerRow[]> {
  await requireRole(['ADMIN'])

  const users = await db.user.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      department: true,
      position: true,
      learningLessons: true,
      learningTests: true,
    },
  })

  return users.map((u) => {
    const lessons: LearnerRow['lessons'] = {}
    let lessonsDone = 0
    for (const id of LESSON_IDS) {
      const row = u.learningLessons.find((l) => l.lessonId === id)
      const slides = !!row?.slidesDone
      const pdf = !!row?.pdfDone
      const video = !!row?.videoDone
      const complete = slides && pdf && video
      if (complete) lessonsDone++
      lessons[id] = { slides, pdf, video, complete }
    }

    const tests: LearnerRow['tests'] = {}
    let testsPassed = 0
    for (const id of TEST_IDS) {
      const row = u.learningTests.find((t) => t.testId === id)
      const passed = !!row?.passed
      if (passed) testsPassed++
      tests[id] = {
        attempts: row?.attempts ?? 0,
        passed,
        bestScore: row?.bestScore ?? 0,
        locked: !!row?.locked,
      }
    }

    const overallPct = Math.round(((lessonsDone + testsPassed) / 6) * 100)
    return {
      userId: u.id,
      name: `${u.firstName} ${u.lastName}`,
      email: u.email,
      department: u.department,
      position: u.position,
      lessons,
      tests,
      overallPct,
      certified: testsPassed === 3,
    }
  })
}
