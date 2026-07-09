'use client'

import { useRef, useState } from 'react'
import {
  BookPlus,
  Upload,
  Download,
  RotateCcw,
  FileText,
  Presentation,
  Video,
  ListChecks,
  Loader2,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  createModuleLesson,
  deleteModuleLesson,
  type MaterialRow,
  type ModuleLessonRow,
} from '@/actions/learning'

// Quiz question-bank template. Mirrors the format the LMS expects:
// header "question,a,b,c,d" where column `a` is ALWAYS the correct answer
// (the app shuffles options at runtime). Authors fill in rows and upload.
const QUIZ_TEMPLATE = [
  'question,a,b,c,d',
  '"What is iORA\'s core retail promise?","Fast, affordable fashion","Luxury only","Wholesale only","Membership clubs"',
  '"When should the fitting room be checked?","After every customer","Once a day","Never","Only on weekends"',
].join('\r\n')

const LESSONS = [
  { no: 1, title: 'Lesson 1 — New Employee Training' },
  { no: 2, title: 'Lesson 2 — Fitting & Storeroom Training' },
  { no: 3, title: 'Lesson 3 — Cashier’s Responsibility Training' },
]

const SLOTS = [
  { kind: 'pptx', label: 'Slides', accept: '.pptx', icon: Presentation },
  { kind: 'pdf', label: 'Reading', accept: '.pdf', icon: FileText },
  { kind: 'video', label: 'Video', accept: '', icon: Video },
  { kind: 'csv', label: 'Quiz bank', accept: '.csv', icon: ListChecks },
] as const

// Module lessons have no test, so no quiz-bank slot.
const MODULE_SLOTS = SLOTS.filter((s) => s.kind !== 'csv')

type Slot = (typeof SLOTS)[number]

function SlotRow({
  refId,
  slot,
  material,
  onSaved,
  onReverted,
}: {
  // "1".."3" for onboarding lessons, or a module lesson id
  refId: string
  slot: Slot
  material: MaterialRow | undefined
  onSaved: (row: MaterialRow) => void
  onReverted: (key: string) => void
}) {
  const key = `${slot.kind}:${refId}`
  const fileRef = useRef<HTMLInputElement>(null)
  const [videoUrl, setVideoUrl] = useState(material?.value ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const Icon = slot.icon

  async function submit(fd: FormData) {
    setBusy(true)
    setError(null)
    fd.append('key', key)
    fd.append('kind', slot.kind)
    try {
      const res = await fetch('/api/learning/materials', { method: 'POST', body: fd })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`)
      onSaved({
        key,
        kind: slot.kind,
        fileName: body.fileName ?? null,
        value: slot.kind === 'video' ? String(fd.get('value') ?? '') : null,
        fileSize: null,
        updatedAt: body.updatedAt,
        uploadedBy: 'you',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function revert() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/learning/materials?key=${encodeURIComponent(key)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error(`Revert failed (${res.status})`)
      setVideoUrl('')
      onReverted(key)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revert failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-28 text-sm font-medium">{slot.label}</div>
      {material ? (
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="default">Custom</Badge>
          <span className="truncate text-xs text-muted-foreground">
            {material.fileName ?? material.value} ·{' '}
            {new Date(material.updatedAt).toLocaleDateString('en-SG')} by {material.uploadedBy}
          </span>
        </div>
      ) : (
        <Badge variant="secondary">Default</Badge>
      )}
      <div className="ml-auto flex items-center gap-2">
        {slot.kind === 'video' ? (
          <>
            <input
              type="url"
              className="h-8 w-56 rounded-md border border-input bg-transparent px-2 text-xs"
              placeholder="https://youtube.com/watch?v=…"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              disabled={busy}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !videoUrl.trim()}
              onClick={() => {
                const fd = new FormData()
                fd.append('value', videoUrl.trim())
                void submit(fd)
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </>
        ) : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={slot.accept}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  const fd = new FormData()
                  fd.append('file', f)
                  void submit(fd)
                }
                e.target.value = ''
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {material ? 'Replace' : 'Upload'}
            </Button>
          </>
        )}
        {material && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void revert()}>
            <RotateCcw className="h-4 w-4" /> Revert
          </Button>
        )}
      </div>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  )
}

/**
 * Admin manager for Learning Hub lesson content. Uploads replace the bundled
 * defaults for every learner (stored in the HRMS database); Revert restores
 * the bundled file. The same controls are available inside the Learning Hub's
 * own admin console.
 */
export function LearningContentManager({ initial }: { initial: MaterialRow[] }) {
  const [materials, setMaterials] = useState<Map<string, MaterialRow>>(
    () => new Map(initial.map((m) => [m.key, m]))
  )

  function saved(row: MaterialRow) {
    setMaterials((prev) => new Map(prev).set(row.key, row))
  }
  function reverted(key: string) {
    setMaterials((prev) => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }

  function downloadQuizTemplate() {
    const blob = new Blob([QUIZ_TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'quiz-template.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookPlus className="h-5 w-5" /> Lesson content
        </CardTitle>
        <CardDescription>
          Upload each lesson&apos;s slides, reading, video link and quiz bank.
          Uploads apply to the whole team immediately; Revert restores the
          bundled default. Quiz banks use the CSV template below — column
          &ldquo;a&rdquo; is always the correct answer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Button variant="outline" size="sm" onClick={downloadQuizTemplate}>
            <Download className="h-4 w-4" /> Download quiz template
          </Button>
        </div>
        {LESSONS.map((lesson) => (
          <div key={lesson.no} className="space-y-2">
            <h3 className="text-sm font-semibold">{lesson.title}</h3>
            {SLOTS.map((slot) => (
              <SlotRow
                key={slot.kind}
                refId={String(lesson.no)}
                slot={slot}
                material={materials.get(`${slot.kind}:${lesson.no}`)}
                onSaved={saved}
                onReverted={reverted}
              />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/**
 * Admin manager for "Module lessons" — the Learning Hub's second tab, shown to
 * learners once they earn the onboarding certificate. Each lesson carries only
 * the parts uploaded here (slides / reading / video).
 */
export function ModuleLessonManager({
  initialLessons,
  initialMaterials,
}: {
  initialLessons: ModuleLessonRow[]
  initialMaterials: MaterialRow[]
}) {
  const [lessons, setLessons] = useState(initialLessons)
  const [materials, setMaterials] = useState<Map<string, MaterialRow>>(
    () => new Map(initialMaterials.map((m) => [m.key, m]))
  )
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function saved(row: MaterialRow) {
    setMaterials((prev) => new Map(prev).set(row.key, row))
  }
  function reverted(key: string) {
    setMaterials((prev) => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const res = await createModuleLesson({ title, summary })
      if (!res.ok || !res.lesson) throw new Error(res.error || 'Create failed')
      setLessons((prev) => [...prev, res.lesson!])
      setTitle('')
      setSummary('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this module lesson (and its uploaded content) for everyone?')) return
    setBusy(true)
    setError(null)
    try {
      const res = await deleteModuleLesson(id)
      if (!res.ok) throw new Error(res.error || 'Delete failed')
      setLessons((prev) => prev.filter((l) => l.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookPlus className="h-5 w-5" /> Module lessons
        </CardTitle>
        <CardDescription>
          Create additional lessons for the Learning Hub&apos;s Module tab.
          Learners see them after earning the onboarding certificate; each
          lesson shows only the parts you upload.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium" htmlFor="ml-title">
              Title
            </label>
            <input
              id="ml-title"
              className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
              placeholder="e.g. Visual Merchandising Basics"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium" htmlFor="ml-summary">
              Summary (optional)
            </label>
            <input
              id="ml-summary"
              className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
              placeholder="One-line description"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button size="sm" disabled={busy || !title.trim()} onClick={() => void create()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookPlus className="h-4 w-4" />}
            Create lesson
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}

        {lessons.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No module lessons yet — create one above, then upload its content.
          </p>
        )}
        {lessons.map((lesson, i) => (
          <div key={lesson.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">
                Module {i + 1} — {lesson.title}
              </h3>
              <span className="text-xs text-muted-foreground">
                {lesson.summary ?? ''}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-destructive"
                disabled={busy}
                onClick={() => void remove(lesson.id)}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </div>
            {MODULE_SLOTS.map((slot) => (
              <SlotRow
                key={slot.kind}
                refId={lesson.id}
                slot={slot}
                material={materials.get(`${slot.kind}:${lesson.id}`)}
                onSaved={saved}
                onReverted={reverted}
              />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
