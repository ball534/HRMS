'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Upload, X, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { uploadDocument, type DocumentCategory } from '@/actions/documents'

type Employee = { id: string; firstName: string; lastName: string }

type Target =
  | { kind: 'COMPANY' }
  | { kind: 'EMPLOYEE'; employeeIds: string[] }

export type UploaderMode = 'hr' | 'employee'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: UploaderMode
  /** HR mode: full employee list for picker. Employee mode: ignored. */
  employees?: Employee[]
  /** Employee mode: the current employee's id. HR mode: optional pre-selected employee. */
  defaultEmployeeId?: string
  /** Pre-selected category (e.g., HR opens a category folder then uploads). */
  defaultCategory?: DocumentCategory
  /** Initial files (e.g., from window drag-and-drop). */
  initialFiles?: File[]
  onUploaded?: () => void
}

const CATEGORY_OPTIONS: { value: DocumentCategory; label: string }[] = [
  { value: 'CONTRACTS', label: 'Contracts' },
  { value: 'PAYSLIPS', label: 'Payslips' },
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'CERTIFICATIONS', label: 'Certifications' },
  { value: 'PERSONAL_DOCS', label: 'Personal Docs' },
  { value: 'OTHER', label: 'Other' },
]

type PerFileStatus = 'queued' | 'uploading' | 'done' | 'error'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentUploaderModal({
  open,
  onOpenChange,
  mode,
  employees = [],
  defaultEmployeeId,
  defaultCategory = 'OTHER',
  initialFiles = [],
  onUploaded,
}: Props) {
  const [files, setFiles] = useState<File[]>(initialFiles)
  const [statuses, setStatuses] = useState<Record<number, PerFileStatus>>({})
  const [targetType, setTargetType] = useState<'COMPANY' | 'SINGLE' | 'MULTI'>(
    mode === 'employee' ? 'SINGLE' : defaultEmployeeId ? 'SINGLE' : 'COMPANY'
  )
  const [singleEmpId, setSingleEmpId] = useState<string>(defaultEmployeeId ?? '')
  const [multiEmpIds, setMultiEmpIds] = useState<string[]>([])
  const [empSearch, setEmpSearch] = useState('')
  const [category, setCategory] = useState<DocumentCategory>(defaultCategory)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const innerFileInput = useRef<HTMLInputElement>(null)

  // Sync initialFiles when modal re-opens with new dropped files
  useEffect(() => {
    if (open) {
      setFiles(initialFiles)
      setStatuses({})
      setTargetType(mode === 'employee' ? 'SINGLE' : defaultEmployeeId ? 'SINGLE' : 'COMPANY')
      setSingleEmpId(defaultEmployeeId ?? (mode === 'employee' ? '' : ''))
      setMultiEmpIds([])
      setCategory(defaultCategory)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming)
    if (arr.length === 0) return
    setFiles((prev) => {
      const next = [...prev]
      const seen = new Set(next.map((f) => `${f.name}-${f.size}`))
      for (const f of arr) {
        const key = `${f.name}-${f.size}`
        if (!seen.has(key)) {
          next.push(f)
          seen.add(key)
        }
      }
      return next
    })
  }, [])

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
    setStatuses((prev) => {
      const next: Record<number, PerFileStatus> = {}
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k)
        if (i < idx) next[i] = v
        else if (i > idx) next[i - 1] = v
      })
      return next
    })
  }, [])

  function handleInnerDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }

  function resolveTarget(): Target | { error: string } {
    if (mode === 'employee') {
      return { kind: 'EMPLOYEE', employeeIds: [defaultEmployeeId ?? singleEmpId] }
    }
    if (targetType === 'COMPANY') return { kind: 'COMPANY' }
    if (targetType === 'SINGLE') {
      if (!singleEmpId) return { error: 'Select an employee' }
      return { kind: 'EMPLOYEE', employeeIds: [singleEmpId] }
    }
    if (multiEmpIds.length === 0) return { error: 'Select at least one employee' }
    return { kind: 'EMPLOYEE', employeeIds: multiEmpIds }
  }

  async function handleUpload() {
    if (files.length === 0) {
      toast.error('Add at least one file')
      return
    }
    const target = resolveTarget()
    if ('error' in target) {
      toast.error(target.error)
      return
    }

    setUploading(true)
    let okCount = 0
    let failCount = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setStatuses((prev) => ({ ...prev, [i]: 'uploading' }))

      try {
        const fd = new FormData()
        fd.append('file', file)
        if (target.kind === 'COMPANY') {
          fd.append('scope', 'COMPANY')
        } else {
          fd.append('scope', 'EMPLOYEE')
          fd.append('employeeIds', JSON.stringify(target.employeeIds))
        }
        fd.append('category', category)

        const res = await fetch('/api/documents/upload-url', { method: 'POST', body: fd })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `Upload failed (${res.status})`)
        }
        const { key, fileName, fileSize, mimeType } = await res.json()

        const result = await uploadDocument({
          name: file.name,
          scope: target.kind,
          category,
          employeeIds: target.kind === 'EMPLOYEE' ? target.employeeIds : undefined,
          s3Key: key,
          fileName,
          fileSize,
          mimeType,
        })
        if (!result.success) throw new Error(result.error ?? 'Save failed')

        setStatuses((prev) => ({ ...prev, [i]: 'done' }))
        okCount++
      } catch (err) {
        console.error('Upload error', file.name, err)
        setStatuses((prev) => ({ ...prev, [i]: 'error' }))
        failCount++
      }
    }

    setUploading(false)

    if (failCount === 0) {
      toast.success(
        `Uploaded ${okCount} file${okCount === 1 ? '' : 's'}`
      )
      onUploaded?.()
      onOpenChange(false)
    } else {
      toast.error(`${failCount} of ${files.length} files failed to upload`)
      onUploaded?.()
    }
  }

  const filteredEmployees = empSearch.trim()
    ? employees.filter((e) =>
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(empSearch.toLowerCase())
      )
    : employees

  const doneCount = Object.values(statuses).filter((s) => s === 'done').length
  const progressPct = uploading ? Math.round((doneCount / files.length) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            {mode === 'employee'
              ? 'Add files to your folder. Drag more anywhere in this window to append.'
              : 'Add files and choose where they go. Drag more anywhere in this window to append.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Target picker (HR only) */}
          {mode === 'hr' && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Send to
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { v: 'COMPANY', label: 'Company-wide' },
                      { v: 'SINGLE', label: 'One employee' },
                      { v: 'MULTI', label: 'Multiple employees' },
                    ] as const
                  ).map((opt) => (
                    <Button
                      key={opt.v}
                      type="button"
                      variant={targetType === opt.v ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTargetType(opt.v)}
                      disabled={uploading}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {targetType === 'SINGLE' && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Employee
                  </label>
                  <select
                    value={singleEmpId}
                    onChange={(e) => setSingleEmpId(e.target.value)}
                    disabled={uploading}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Select employee…</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetType === 'MULTI' && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Recipients ({multiEmpIds.length} selected)
                  </label>
                  <Input
                    placeholder="Search employees…"
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    disabled={uploading}
                    className="mb-2"
                  />
                  <div className="max-h-40 overflow-y-auto rounded-md border border-input bg-background p-2 space-y-1">
                    {filteredEmployees.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-1 py-2">
                        No employees match.
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 px-1 pb-1 border-b border-border">
                          <button
                            type="button"
                            onClick={() => setMultiEmpIds(filteredEmployees.map((e) => e.id))}
                            disabled={uploading}
                            className="text-xs text-primary hover:underline"
                          >
                            Select all
                          </button>
                          <span className="text-xs text-muted-foreground">·</span>
                          <button
                            type="button"
                            onClick={() => setMultiEmpIds([])}
                            disabled={uploading}
                            className="text-xs text-primary hover:underline"
                          >
                            Clear
                          </button>
                        </div>
                        {filteredEmployees.map((e) => {
                          const checked = multiEmpIds.includes(e.id)
                          return (
                            <label
                              key={e.id}
                              className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={uploading}
                                onChange={(ev) => {
                                  if (ev.target.checked) {
                                    setMultiEmpIds((prev) => [...prev, e.id])
                                  } else {
                                    setMultiEmpIds((prev) => prev.filter((id) => id !== e.id))
                                  }
                                }}
                              />
                              <span>
                                {e.firstName} {e.lastName}
                              </span>
                            </label>
                          )
                        })}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              disabled={uploading}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none disabled:opacity-50"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* File preview list + inner drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!uploading) setDragOver(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOver(false)
            }}
            onDrop={handleInnerDrop}
            className={`rounded-lg border-2 border-dashed transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border bg-background'
            } p-3 min-h-[140px]`}
          >
            {files.length === 0 ? (
              <button
                type="button"
                onClick={() => innerFileInput.current?.click()}
                disabled={uploading}
                className="w-full h-full min-h-[120px] flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <Upload className="h-6 w-6" />
                <span>Drop files here or click to browse</span>
              </button>
            ) : (
              <>
                <ul className="space-y-1.5 mb-2">
                  {files.map((f, i) => {
                    const status = statuses[i]
                    return (
                      <li
                        key={`${f.name}-${f.size}-${i}`}
                        className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{f.name}</p>
                          <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                        </div>
                        {status === 'uploading' && (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        )}
                        {status === 'done' && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        )}
                        {status === 'error' && (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                        {!uploading && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => removeFile(i)}
                            title="Remove"
                          >
                            <X />
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{files.length} file{files.length === 1 ? '' : 's'} queued</span>
                  <button
                    type="button"
                    onClick={() => innerFileInput.current?.click()}
                    disabled={uploading}
                    className="text-primary hover:underline disabled:opacity-50"
                  >
                    + Add more
                  </button>
                </div>
              </>
            )}
            <input
              ref={innerFileInput}
              type="file"
              multiple
              hidden
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          {/* Progress bar */}
          {uploading && (
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Uploading…</span>
                <span>
                  {doneCount} / {files.length}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading || files.length === 0}>
            {uploading ? 'Uploading…' : `Upload ${files.length || ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
