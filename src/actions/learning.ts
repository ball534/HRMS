'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { requireCapability } from '@/lib/dal'
import { notify, notifyHr } from '@/lib/notify'

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
  // enrollment (start-of-employment) in ms — drives week-based lesson unlocks
  enrolledAt: number
  // keyed by onboarding lesson id ("lesson1"..) or module lesson id
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
      select: { firstName: true, lastName: true, role: true, startDate: true, createdAt: true },
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
    enrolledAt: (user?.startDate ?? user?.createdAt ?? new Date()).getTime(),
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
  const [existingLessons, moduleLessons, moduleMaterials] = await Promise.all([
    db.learningLessonProgress.findMany({ where: { userId } }),
    db.learningModuleLesson.findMany({ select: { id: true } }),
    db.learningMaterial.findMany({ select: { key: true } }),
  ])
  const existingByLesson = new Map(existingLessons.map((l) => [l.lessonId, l]))
  const existingTests = await db.learningTestProgress.findMany({ where: { userId } })
  const wasLocked = new Set(existingTests.filter((t) => t.locked).map((t) => t.testId))

  // Module lessons only have the parts an admin actually uploaded, so their
  // "all done" check is against the material keys present for that lesson.
  const PART_BY_KIND: Record<string, 'slides' | 'pdf' | 'video'> = {
    pptx: 'slides',
    pdf: 'pdf',
    video: 'video',
  }
  const modulePartsById = new Map<string, ('slides' | 'pdf' | 'video')[]>()
  for (const { id } of moduleLessons) modulePartsById.set(id, [])
  for (const { key } of moduleMaterials) {
    const [kind, ref] = key.split(':')
    const parts = modulePartsById.get(ref)
    if (parts && PART_BY_KIND[kind]) parts.push(PART_BY_KIND[kind])
  }

  const lessonIds = [
    ...LESSON_IDS.filter((id) => progress[id]),
    ...[...modulePartsById.keys()].filter((id) => progress[id]),
  ]

  await Promise.all([
    ...lessonIds.map((lessonId) => {
      const parts = progress[lessonId].parts
      const slidesDone = !!parts.slides
      const pdfDone = !!parts.pdf
      const videoDone = !!parts.video
      const modParts = modulePartsById.get(lessonId)
      const allDone = modParts
        ? modParts.length > 0 && modParts.every((p) => !!parts[p])
        : slidesDone && pdfDone && videoDone
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

  // Tell HR when a learner locks themselves out.
  //
  // The client used to push a string onto an `hrEvents` array that was never
  // persisted, emailed or shown to anyone — so the "HR has been notified"
  // message the learner saw was not true, and nobody could act on a lockout
  // they never heard about. Only newly-locked tests notify, so a repeated
  // progress sync doesn't spam the HR inbox.
  const newlyLocked = TEST_IDS.filter(
    (id) => tests[id]?.locked && !wasLocked.has(id),
  )
  if (newlyLocked.length) {
    const learner = await db.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, department: true },
    })
    const who = learner ? `${learner.firstName} ${learner.lastName}` : 'A learner'

    for (const testId of newlyLocked) {
      await notifyHr({
        type: 'LEARNING_LOCKED_OUT',
        title: `Learning lockout: ${who} — ${testId}`,
        body: `${who}${learner?.department ? ` (${learner.department})` : ''} has used all attempts on ${testId} and is locked out. Reset their access from Learning Progress.`,
        linkUrl: '/admin/learning',
      })
      await notify({
        userId,
        type: 'LEARNING_LOCKED_OUT',
        title: `You are locked out of ${testId}`,
        body: 'HR has been notified and can reset your access. You do not need to do anything else.',
        linkUrl: '/learning',
      })
    }
  }

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
// listLearningMaterials — admin content-manager view of uploaded
// lesson material overrides (writes go through /api/learning/materials)
// ============================================================

export type MaterialRow = {
  key: string
  kind: string
  fileName: string | null
  value: string | null
  fileSize: number | null
  updatedAt: string
  uploadedBy: string
}

export async function listLearningMaterials(): Promise<MaterialRow[]> {
  await requireCapability('learning.admin')

  const rows = await db.learningMaterial.findMany({
    include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    orderBy: { key: 'asc' },
  })

  return rows.map((m) => ({
    key: m.key,
    kind: m.kind,
    fileName: m.fileName,
    // only the video URL is surfaced; CSV text stays server-side
    value: m.kind === 'video' ? m.text : null,
    fileSize: m.fileSize,
    updatedAt: m.updatedAt.toISOString(),
    uploadedBy: `${m.uploadedBy.firstName} ${m.uploadedBy.lastName}`,
  }))
}

// ============================================================
// Module lessons — admin-created lessons shown in the Learning Hub's
// "Module lessons" tab (unlocked after the onboarding certificate)
// ============================================================

export type ModuleLessonRow = {
  id: string
  title: string
  summary: string | null
  position: number
  createdBy: string
  createdAt: string
}

export async function listModuleLessons(): Promise<ModuleLessonRow[]> {
  await requireCapability('learning.admin')

  const rows = await db.learningModuleLesson.findMany({
    include: { createdBy: { select: { firstName: true, lastName: true } } },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map((m) => ({
    id: m.id,
    title: m.title,
    summary: m.summary,
    position: m.position,
    createdBy: `${m.createdBy.firstName} ${m.createdBy.lastName}`,
    createdAt: m.createdAt.toISOString(),
  }))
}

export async function createModuleLesson(data: {
  title: string
  summary?: string
}): Promise<{ ok: boolean; lesson?: ModuleLessonRow; error?: string }> {
  const session = await requireCapability('learning.admin')

  const title = data.title?.trim()
  if (!title) return { ok: false, error: 'Title is required' }

  const last = await db.learningModuleLesson.findFirst({
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  const row = await db.learningModuleLesson.create({
    data: {
      title,
      summary: data.summary?.trim() || null,
      position: (last?.position ?? 0) + 1,
      createdById: session.userId,
    },
    include: { createdBy: { select: { firstName: true, lastName: true } } },
  })
  return {
    ok: true,
    lesson: {
      id: row.id,
      title: row.title,
      summary: row.summary,
      position: row.position,
      createdBy: `${row.createdBy.firstName} ${row.createdBy.lastName}`,
      createdAt: row.createdAt.toISOString(),
    },
  }
}

export async function deleteModuleLesson(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  await requireCapability('learning.admin')

  const lesson = await db.learningModuleLesson.findUnique({ where: { id } })
  if (!lesson) return { ok: false, error: 'Not found' }

  await db.$transaction([
    db.learningMaterial.deleteMany({
      where: { key: { in: ['pptx', 'pdf', 'video'].map((k) => `${k}:${id}`) } },
    }),
    db.learningLessonProgress.deleteMany({ where: { lessonId: id } }),
    db.learningModuleLesson.delete({ where: { id } }),
  ])
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
  await requireCapability('learning.admin')

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
