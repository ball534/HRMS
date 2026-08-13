import Link from 'next/link'
import { requireCapability } from '@/lib/dal'
import {
  getAllLearningProgress,
  listLearningMaterials,
  listModuleLessons,
  type LearnerRow,
} from '@/actions/learning'
import {
  LearningContentManager,
  ModuleLessonManager,
} from '@/components/admin/LearningContentManager'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ReversalDialog } from '@/components/shared/ReversalDialog'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const LESSON_IDS = ['lesson1', 'lesson2', 'lesson3'] as const
const TEST_IDS = ['test1', 'test2', 'test3'] as const

function LessonCell({ cell }: { cell: LearnerRow['lessons'][string] }) {
  if (cell.complete) {
    return <Badge variant="default">Done</Badge>
  }
  const started = cell.slides || cell.pdf || cell.video
  if (started) {
    const n = [cell.slides, cell.pdf, cell.video].filter(Boolean).length
    return <Badge variant="secondary">{n}/3</Badge>
  }
  return <span className="text-muted-foreground">—</span>
}

function TestCell({
  cell,
  userId,
  testId,
}: {
  cell: LearnerRow['tests'][string]
  userId: string
  testId: string
}) {
  if (cell.passed) {
    return (
      <Badge variant="default">{Math.round(cell.bestScore * 100)}%</Badge>
    )
  }
  if (cell.locked) {
    // The lockout message shown to learners has always told them "contact HR,
    // who can reset your access" — this button is what finally makes that true.
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge variant="destructive">Locked</Badge>
        <ReversalDialog
          entityType="LEARNING"
          entityId={`${userId}:${testId}`}
          to="UNLOCKED"
          actionLabel="Reset"
          description="Unlocks the test and resets the attempt counter to zero so the learner can sit it again."
          revalidate={['/admin/learning']}
          variant="ghost"
        />
      </div>
    )
  }
  if (cell.attempts > 0) {
    return <Badge variant="secondary">{cell.attempts} att.</Badge>
  }
  return <span className="text-muted-foreground">—</span>
}

export default async function AdminLearningPage() {
  await requireCapability('learning.admin')
  const [rows, materials, moduleLessons] = await Promise.all([
    getAllLearningProgress(),
    listLearningMaterials(),
    listModuleLessons(),
  ])

  const started = rows.filter((r) => r.overallPct > 0)
  const certified = rows.filter((r) => r.certified).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Learning Progress</h1>
        <p className="text-sm text-muted-foreground">
          Onboarding journey progress across the team, synced from the iORA
          Learning Hub.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Employees</CardDescription>
            <CardTitle className="text-2xl">{rows.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Started</CardDescription>
            <CardTitle className="text-2xl">{started.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Certified</CardDescription>
            <CardTitle className="text-2xl">{certified}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completion</CardDescription>
            <CardTitle className="text-2xl">
              {rows.length
                ? Math.round(
                    rows.reduce((s, r) => s + r.overallPct, 0) / rows.length
                  )
                : 0}
              %
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per-employee progress</CardTitle>
          <CardDescription>
            Lessons show parts completed (slides → reading → video); tests show
            best score, attempts, or lockout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  {LESSON_IDS.map((id, i) => (
                    <TableHead key={id} className="text-center">
                      L{i + 1}
                    </TableHead>
                  ))}
                  {TEST_IDS.map((id, i) => (
                    <TableHead key={id} className="text-center">
                      T{i + 1}
                    </TableHead>
                  ))}
                  <TableHead className="text-center">Overall</TableHead>
                  <TableHead className="text-center">Cert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell>
                      <Link
                        href={`/people/${r.userId}`}
                        className="font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {r.position ?? r.email}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.department ?? '—'}
                    </TableCell>
                    {LESSON_IDS.map((id) => (
                      <TableCell key={id} className="text-center">
                        <LessonCell cell={r.lessons[id]} />
                      </TableCell>
                    ))}
                    {TEST_IDS.map((id) => (
                      <TableCell key={id} className="text-center">
                        <TestCell cell={r.tests[id]} userId={r.userId} testId={id} />
                      </TableCell>
                    ))}
                    <TableCell className="text-center font-medium">
                      {r.overallPct}%
                    </TableCell>
                    <TableCell className="text-center">
                      {r.certified ? (
                        <Badge variant="default">✓</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-muted-foreground"
                    >
                      No employees found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <LearningContentManager initial={materials} />

      <ModuleLessonManager
        initialLessons={moduleLessons}
        initialMaterials={materials}
      />
    </div>
  )
}
