'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, FileText, Upload } from 'lucide-react'
import {
  installPlaceholderTemplate,
  uploadLetterTemplate,
  type LetterTemplateRow,
} from '@/actions/letterTemplates'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type LetterType = 'EMPLOYMENT' | 'CONFIRMATION'

const LABEL: Record<LetterType, string> = {
  EMPLOYMENT: 'Employment letter',
  CONFIRMATION: 'Confirmation letter',
}

export function LetterTemplateManager({
  rows,
  missingTypes,
  availableMergeFields,
}: {
  rows: LetterTemplateRow[]
  missingTypes: LetterType[]
  availableMergeFields: string[]
}) {
  return (
    <div className="space-y-6">
      {(['EMPLOYMENT', 'CONFIRMATION'] as LetterType[]).map(type => {
        const row = rows.find(r => r.type === type)
        return <TemplateCard key={type} type={type} row={row} missing={missingTypes.includes(type)} />
      })}

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Merge fields</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Name a text field in your PDF exactly one of these and the app fills it. Anything else is
          left alone. Keep the boxes generous — a PDF form field clips rather than reflowing, so a
          long job title in a short box loses its end.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {availableMergeFields.map(f => (
            <code
              key={f}
              className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[11px]"
            >
              {f}
            </code>
          ))}
        </div>
      </div>
    </div>
  )
}

function TemplateCard({
  type,
  row,
  missing,
}: {
  type: LetterType
  row?: LetterTemplateRow
  missing: boolean
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [selectedName, setSelectedName] = useState<string | null>(null)

  function install() {
    startTransition(async () => {
      const res = await installPlaceholderTemplate(type)
      if (res.error) toast.error(res.error)
      else {
        toast.success('Placeholder template installed')
        router.refresh()
      }
    })
  }

  function upload() {
    const file = fileInput.current?.files?.[0]
    if (!file) {
      toast.error('Choose a PDF first')
      return
    }
    const fd = new FormData()
    fd.set('type', type)
    fd.set('file', file)
    startTransition(async () => {
      const res = await uploadLetterTemplate(fd)
      if (res.error) toast.error(res.error)
      else {
        toast.success(`${LABEL[type]} template updated`)
        setSelectedName(null)
        if (fileInput.current) fileInput.current.value = ''
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{LABEL[type]}</span>
        {missing && <Badge variant="destructive">No template</Badge>}
        {row?.isPlaceholder && <Badge variant="secondary">Placeholder</Badge>}
        {row && !row.isPlaceholder && <Badge>In use</Badge>}
      </div>

      <div className="space-y-3 px-4 py-3 text-sm">
        {missing && (
          <div className="space-y-2">
            <p className="text-muted-foreground">
              No template is installed, so letters of this type are created without a PDF. Install
              the built-in placeholder to get the workflow running, then replace it with your own
              stationery.
            </p>
            <Button size="sm" variant="outline" onClick={install} disabled={isPending}>
              {isPending ? 'Installing…' : 'Install placeholder template'}
            </Button>
          </div>
        )}

        {row && (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
              <a href={`/api/files/${row.blobId}`} className="text-primary hover:underline">
                {row.fileName}
              </a>
              <span>
                · {row.fieldNames.length} field(s)
                {row.uploadedByName && ` · ${row.uploadedByName}`}
              </span>
            </div>

            {row.isPlaceholder && (
              <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-900 dark:bg-amber-950/40">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  This is the built-in placeholder — plain and unbranded. Letters generated from it
                  are functional but are not company stationery.
                </span>
              </p>
            )}

            {row.unrecognisedFields.length > 0 && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-900 dark:bg-amber-950/40">
                <strong>{row.unrecognisedFields.length} field(s) will never be filled</strong> —{' '}
                {row.unrecognisedFields.join(', ')} — because they match no merge field. Check the
                spelling against the list below.
              </p>
            )}

            {row.unusedMergeFields.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Not used by this template: {row.unusedMergeFields.join(', ')}. That is fine if the
                letter doesn&apos;t need them.
              </p>
            )}
          </>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={e => setSelectedName(e.target.files?.[0]?.name ?? null)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInput.current?.click()}
            disabled={isPending}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Choose PDF
          </Button>
          {selectedName && (
            <>
              <span className="text-xs text-muted-foreground">{selectedName}</span>
              <Button size="sm" onClick={upload} disabled={isPending}>
                {isPending ? 'Uploading…' : row ? 'Replace template' : 'Upload template'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
