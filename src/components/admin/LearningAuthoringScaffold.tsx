'use client'

import { useState } from 'react'
import { BookPlus, Upload, Download, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

// Quiz question-bank template. Mirrors the format the LMS expects today:
// header "question,a,b,c,d" where column `a` is ALWAYS the correct answer
// (the app shuffles options at runtime). Authors fill in rows and re-upload.
const QUIZ_TEMPLATE = [
  'question,a,b,c,d',
  '"What is iORA\'s core retail promise?","Fast, affordable fashion","Luxury only","Wholesale only","Membership clubs"',
  '"When should the fitting room be checked?","After every customer","Once a day","Never","Only on weekends"',
].join('\r\n')

export function LearningAuthoringScaffold() {
  const [note, setNote] = useState<string | null>(null)

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
          <BookPlus className="h-5 w-5" /> Content authoring
        </CardTitle>
        <CardDescription>
          Add and manage Learning Hub content. Authoring is scaffolded here as
          the next phase — the quiz template download works today; lesson
          creation and content upload are stubbed and not yet wired to storage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="default"
            onClick={() =>
              setNote(
                'Create Lesson is coming in the next phase: a title + content upload (slides / PDF / video) that saves to the LMS via Google Drive.'
              )
            }
          >
            <BookPlus className="h-4 w-4" /> Create Lesson
          </Button>

          <Button
            variant="outline"
            onClick={() =>
              setNote(
                'Content upload is coming in the next phase: drop a .pptx / .pdf / video link and it is attached to a lesson (stored in Google Drive, like HRMS documents).'
              )
            }
          >
            <Upload className="h-4 w-4" /> Upload content
          </Button>

          <Button variant="outline" onClick={downloadQuizTemplate}>
            <Download className="h-4 w-4" /> Download quiz template
          </Button>
        </div>

        {note && (
          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{note}</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Planned flow: <strong>Create Lesson</strong> → upload slides, reading
          and video → upload a completed quiz template. Until then, course
          materials are managed in <code>public/materials/&lt;lang&gt;/</code>.
        </p>
      </CardContent>
    </Card>
  )
}
