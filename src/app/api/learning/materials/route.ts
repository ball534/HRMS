import { NextRequest, NextResponse } from 'next/server'
import { verifySession, requireCapability } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'
import { db } from '@/lib/db'

// ============================================================
// Learning Hub material overrides.
//
// Admins upload replacement lesson content (slides / reading / video link /
// quiz bank) here; it is stored in Postgres and served to every learner,
// replacing the bundled defaults in public/materials. Keys mirror the LMS
// override map: "<kind>:<lessonNo>", e.g. "pptx:1", "pdf:2", "video:3", "csv:1".
// ============================================================

// Onboarding overrides target lessons 1-3 (all four kinds); module lesson
// content targets a LearningModuleLesson uuid (no quiz — modules have no test).
const ONBOARDING_KEY_RE = /^(pptx|pdf|video|csv):[1-3]$/
const MODULE_KEY_RE = /^(pptx|pdf|video):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const MIME_BY_KIND: Record<string, string> = {
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  csv: 'text/csv',
}

// Postgres handles this fine and it stays well under serverless body limits
// once deployed; slide decks routinely run a few MB.
const MAX_FILE_BYTES = 20 * 1024 * 1024

// ---- GET: override map + module lesson list used by the LMS at hydration ----
// Override values: pptx/pdf → serving URL; video → URL/id; csv → raw CSV text.
// Modules carry their parts resolved the same way.
export async function GET() {
  await verifySession()

  const [rows, moduleRows] = await Promise.all([
    db.learningMaterial.findMany({
      select: { key: true, kind: true, text: true, fileName: true },
    }),
    db.learningModuleLesson.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, summary: true },
    }),
  ])

  const servingUrl = (key: string) =>
    `/api/learning/materials/${encodeURIComponent(key)}`

  const overrides: Record<string, string> = {}
  const byKey = new Map(rows.map((r) => [r.key, r]))
  for (const row of rows) {
    if (!ONBOARDING_KEY_RE.test(row.key)) continue
    if (row.kind === 'video' || row.kind === 'csv') {
      if (row.text) overrides[row.key] = row.text
    } else {
      overrides[row.key] = servingUrl(row.key)
    }
  }

  const modules = moduleRows.map((m) => {
    const slides = byKey.get(`pptx:${m.id}`)
    const pdf = byKey.get(`pdf:${m.id}`)
    const video = byKey.get(`video:${m.id}`)
    return {
      id: m.id,
      title: m.title,
      summary: m.summary,
      parts: {
        slides: slides ? servingUrl(slides.key) : null,
        pdf: pdf ? { name: pdf.fileName ?? 'Reading.pdf', url: servingUrl(pdf.key) } : null,
        video: video?.text ?? null,
      },
    }
  })

  return NextResponse.json({ overrides, modules })
}

// ---- POST: upload/replace a material (admin only) ----
export async function POST(req: NextRequest) {
  const session = await requireCapability('learning.admin')

  const formData = await req.formData()
  const key = String(formData.get('key') ?? '')
  const kind = String(formData.get('kind') ?? '')

  const isOnboarding = ONBOARDING_KEY_RE.test(key)
  const isModule = MODULE_KEY_RE.test(key)
  if ((!isOnboarding && !isModule) || key.split(':')[0] !== kind) {
    return NextResponse.json({ error: 'Invalid material key' }, { status: 400 })
  }
  if (isModule) {
    const moduleId = key.split(':')[1]
    const exists = await db.learningModuleLesson.findUnique({
      where: { id: moduleId },
      select: { id: true },
    })
    if (!exists) {
      return NextResponse.json({ error: 'Module lesson not found' }, { status: 404 })
    }
  }

  let payload: {
    fileName: string | null
    mimeType: string | null
    fileSize: number | null
    data: Uint8Array<ArrayBuffer> | null
    text: string | null
  }

  if (kind === 'video') {
    const value = String(formData.get('value') ?? '').trim()
    if (!value) {
      return NextResponse.json({ error: 'Video URL required' }, { status: 400 })
    }
    payload = { fileName: null, mimeType: null, fileSize: null, data: null, text: value }
  } else {
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 400 })
    }
    if (kind === 'csv') {
      payload = {
        fileName: file.name,
        mimeType: 'text/csv',
        fileSize: file.size,
        data: null,
        text: await file.text(),
      }
    } else {
      payload = {
        fileName: file.name,
        mimeType: MIME_BY_KIND[kind],
        fileSize: file.size,
        data: new Uint8Array(await file.arrayBuffer()),
        text: null,
      }
    }
  }

  const row = await db.learningMaterial.upsert({
    where: { key },
    create: { key, kind, ...payload, uploadedById: session.userId },
    update: { ...payload, uploadedById: session.userId },
  })

  await createAuditLog({
    userId: session.userId,
    action: 'DOCUMENT_UPLOADED',
    entityType: 'DOCUMENT',
    entityId: row.id,
    details: { learningMaterial: key, fileName: payload.fileName },
  })

  return NextResponse.json({
    ok: true,
    key,
    fileName: payload.fileName,
    updatedAt: row.updatedAt.toISOString(),
  })
}

// ---- DELETE: revert a material to the bundled default (admin only) ----
export async function DELETE(req: NextRequest) {
  const session = await requireCapability('learning.admin')

  const key = req.nextUrl.searchParams.get('key') ?? ''
  if (!ONBOARDING_KEY_RE.test(key) && !MODULE_KEY_RE.test(key)) {
    return NextResponse.json({ error: 'Invalid material key' }, { status: 400 })
  }

  await db.learningMaterial.deleteMany({ where: { key } })

  await createAuditLog({
    userId: session.userId,
    action: 'DOCUMENT_DELETED',
    entityType: 'DOCUMENT',
    entityId: key,
    details: { learningMaterial: key, revertedToDefault: true },
  })

  return NextResponse.json({ ok: true })
}
