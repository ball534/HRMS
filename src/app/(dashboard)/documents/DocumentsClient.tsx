'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Folder,
  FolderOpen,
  ChevronRight,
  Search,
  Upload,
  ArrowUpDown,
  X,
  Download,
  Trash2,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getDocuments,
  getEmployeeFolderSummary,
  deleteDocument,
  type DocumentRecord,
  type DocumentCategory,
  type EmployeeFolderSummary,
} from '@/actions/documents'
import { DocumentUploaderModal } from '@/components/documents/DocumentUploaderModal'

type Employee = { id: string; firstName: string; lastName: string }

type Props = {
  role: string
  userId: string
  employees: Employee[]
}

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'CONTRACTS', label: 'Contracts' },
  { value: 'PAYSLIPS', label: 'Payslips' },
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'CERTIFICATIONS', label: 'Certifications' },
  { value: 'PERSONAL_DOCS', label: 'Personal Docs' },
  { value: 'OTHER', label: 'Other' },
]

function categoryLabel(c: DocumentCategory): string {
  return CATEGORIES.find((x) => x.value === c)?.label ?? c
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/'))
    return <ImageIcon className="h-5 w-5 text-blue-500 shrink-0" />
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  )
    return <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" />
  return <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
}

// ===================================================================
// DocRow — shared list item with download + delete
// ===================================================================

function DocRow({
  doc,
  onDeleted,
}: {
  doc: DocumentRecord
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return
    setDeleting(true)
    const res = await deleteDocument(doc.id)
    if (res.success) {
      toast.success('Deleted')
      onDeleted()
    } else {
      toast.error(res.error ?? 'Delete failed')
    }
    setDeleting(false)
  }

  return (
    <li className="flex items-center gap-3 py-2.5 px-2 rounded-md hover:bg-muted/50">
      <FileIcon mimeType={doc.mimeType} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{doc.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {formatBytes(doc.fileSize)} ·{' '}
          {new Date(doc.updatedAt).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}{' '}
          · by {doc.uploadedBy.firstName} {doc.uploadedBy.lastName}
        </p>
      </div>
      <a
        href={doc.downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`Download ${doc.name}`}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Download className="h-4 w-4" />
      </a>
      {doc.canDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          title="Delete"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  )
}

// ===================================================================
// HRView — Google-Drive-style folder browser
// ===================================================================

type HRLevel = 'root' | 'employee' | 'category' | 'company-categories' | 'company-category'

function HRView({
  employees,
  files,
  onFilesConsumed,
}: {
  employees: Employee[]
  files: File[] | null
  onFilesConsumed: () => void
}) {
  const [level, setLevel] = useState<HRLevel>('root')
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [category, setCategory] = useState<DocumentCategory | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [summary, setSummary] = useState<EmployeeFolderSummary[]>([])
  const [docs, setDocs] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [uploaderOpen, setUploaderOpen] = useState(false)
  const [uploaderFiles, setUploaderFiles] = useState<File[]>([])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 200)
    return () => clearTimeout(t)
  }, [search])

  const isSearching = debouncedSearch.length > 0

  // Open uploader when files are dropped at window level
  useEffect(() => {
    if (files && files.length > 0) {
      setUploaderFiles(files)
      setUploaderOpen(true)
      onFilesConsumed()
    }
  }, [files, onFilesConsumed])

  // Load summary on mount
  useEffect(() => {
    getEmployeeFolderSummary().then(setSummary).catch(() => {})
  }, [])

  const reloadDocs = useCallback(async () => {
    setLoading(true)
    try {
      if (isSearching) {
        const result = await getDocuments({ search: debouncedSearch })
        setDocs(result)
      } else if (level === 'category' && employeeId && category) {
        const result = await getDocuments({
          scope: 'EMPLOYEE',
          employeeId,
          category,
        })
        setDocs(result)
      } else if (level === 'company-category' && category) {
        const result = await getDocuments({ scope: 'COMPANY', category })
        setDocs(result)
      } else {
        setDocs([])
      }
    } finally {
      setLoading(false)
    }
  }, [isSearching, debouncedSearch, level, employeeId, category])

  useEffect(() => {
    reloadDocs()
  }, [reloadDocs])

  const selectedEmployee = employeeId
    ? employees.find((e) => e.id === employeeId)
    : null

  return (
    <div className="space-y-4">
      {/* Header: search + upload */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all documents…"
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button onClick={() => {
          setUploaderFiles([])
          setUploaderOpen(true)
        }}>
          <Upload className="h-4 w-4" /> Upload
        </Button>
      </div>

      {/* Breadcrumbs (hidden during search) */}
      {!isSearching && (
        <Breadcrumbs
          level={level}
          employeeName={
            selectedEmployee
              ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}`
              : null
          }
          categoryName={category ? categoryLabel(category) : null}
          onRoot={() => {
            setLevel('root')
            setEmployeeId(null)
            setCategory(null)
          }}
          onEmployees={() => {
            setLevel('root')
            setCategory(null)
          }}
          onCompany={() => {
            setLevel('company-categories')
            setCategory(null)
          }}
          onEmployee={() => {
            setLevel('employee')
            setCategory(null)
          }}
        />
      )}

      {/* Body */}
      {isSearching ? (
        <SearchResults docs={docs} loading={loading} onChanged={reloadDocs} />
      ) : level === 'root' ? (
        <RootView
          summary={summary}
          onOpenCompany={() => setLevel('company-categories')}
          onOpenEmployee={(id) => {
            setEmployeeId(id)
            setLevel('employee')
          }}
        />
      ) : level === 'company-categories' ? (
        <CategoryGrid
          onPick={(c) => {
            setCategory(c)
            setLevel('company-category')
          }}
        />
      ) : level === 'employee' ? (
        <CategoryGrid
          onPick={(c) => {
            setCategory(c)
            setLevel('category')
          }}
        />
      ) : (
        <DocList docs={docs} loading={loading} onChanged={reloadDocs} />
      )}

      <DocumentUploaderModal
        open={uploaderOpen}
        onOpenChange={setUploaderOpen}
        mode="hr"
        employees={employees}
        defaultEmployeeId={
          level === 'employee' || level === 'category' ? employeeId ?? undefined : undefined
        }
        defaultCategory={category ?? 'OTHER'}
        initialFiles={uploaderFiles}
        onUploaded={() => {
          reloadDocs()
          getEmployeeFolderSummary().then(setSummary).catch(() => {})
        }}
      />
    </div>
  )
}

function Breadcrumbs({
  level,
  employeeName,
  categoryName,
  onRoot,
  onEmployees,
  onCompany,
  onEmployee,
}: {
  level: HRLevel
  employeeName: string | null
  categoryName: string | null
  onRoot: () => void
  onEmployees: () => void
  onCompany: () => void
  onEmployee: () => void
}) {
  const crumbs: { label: string; onClick?: () => void }[] = [{ label: 'Documents', onClick: onRoot }]
  if (level === 'company-categories') crumbs.push({ label: 'Company' })
  if (level === 'company-category') {
    crumbs.push({ label: 'Company', onClick: onCompany })
    if (categoryName) crumbs.push({ label: categoryName })
  }
  if (level === 'employee' && employeeName) {
    crumbs.push({ label: employeeName })
  }
  if (level === 'category') {
    if (employeeName) crumbs.push({ label: employeeName, onClick: onEmployee })
    if (categoryName) crumbs.push({ label: categoryName })
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          {c.onClick ? (
            <button
              type="button"
              onClick={c.onClick}
              className="hover:text-foreground hover:underline"
            >
              {c.label}
            </button>
          ) : (
            <span className="text-foreground font-medium">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

function RootView({
  summary,
  onOpenCompany,
  onOpenEmployee,
}: {
  summary: EmployeeFolderSummary[]
  onOpenCompany: () => void
  onOpenEmployee: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <FolderCard
        icon={<FolderOpen className="h-6 w-6 text-amber-600" />}
        title="Company"
        subtitle="Company-wide documents"
        onClick={onOpenCompany}
      />
      {summary.map((e) => (
        <FolderCard
          key={e.employeeId}
          icon={<Folder className="h-6 w-6 text-blue-500" />}
          title={`${e.firstName} ${e.lastName}`}
          subtitle={`${e.docCount} file${e.docCount === 1 ? '' : 's'}${
            e.lastUpdated
              ? ` · updated ${new Date(e.lastUpdated).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                })}`
              : ''
          }`}
          onClick={() => onOpenEmployee(e.employeeId)}
        />
      ))}
    </div>
  )
}

function CategoryGrid({ onPick }: { onPick: (c: DocumentCategory) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {CATEGORIES.map((c) => (
        <FolderCard
          key={c.value}
          icon={<Folder className="h-6 w-6 text-blue-500" />}
          title={c.label}
          onClick={() => onPick(c.value)}
        />
      ))}
    </div>
  )
}

function FolderCard({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left hover:bg-muted/50 hover:border-foreground/20 transition-colors"
    >
      {icon}
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
      </div>
    </button>
  )
}

function DocList({
  docs,
  loading,
  onChanged,
}: {
  docs: DocumentRecord[]
  loading: boolean
  onChanged: () => void
}) {
  if (loading) return <p className="text-sm text-muted-foreground p-4">Loading…</p>
  if (docs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No files here yet. Drop files anywhere to upload.
        </p>
      </div>
    )
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
      {docs.map((d) => (
        <DocRow key={d.id} doc={d} onDeleted={onChanged} />
      ))}
    </ul>
  )
}

function SearchResults({
  docs,
  loading,
  onChanged,
}: {
  docs: DocumentRecord[]
  loading: boolean
  onChanged: () => void
}) {
  if (loading) return <p className="text-sm text-muted-foreground p-4">Searching…</p>
  if (docs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">No matches.</p>
      </div>
    )
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
      {docs.map((d) => (
        <li
          key={d.id}
          className="flex items-center gap-3 py-2.5 px-2 hover:bg-muted/50"
        >
          <FileIcon mimeType={d.mimeType} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{d.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {d.scope === 'COMPANY'
                ? 'Company'
                : d.employee
                  ? `${d.employee.firstName} ${d.employee.lastName}`
                  : '—'}{' '}
              · {categoryLabel(d.category)} · {formatBytes(d.fileSize)} ·{' '}
              {new Date(d.updatedAt).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>
          <a
            href={d.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Download className="h-4 w-4" />
          </a>
          {d.canDelete && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`Delete "${d.name}"?`)) return
                const res = await deleteDocument(d.id)
                if (res.success) {
                  toast.success('Deleted')
                  onChanged()
                } else {
                  toast.error(res.error ?? 'Delete failed')
                }
              }}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

// ===================================================================
// EmployeeView — flat list of own + company, search + sort
// ===================================================================

type SortField = 'updatedAt' | 'createdAt' | 'name' | 'mimeType'

function EmployeeView({
  userId,
  files,
  onFilesConsumed,
}: {
  userId: string
  files: File[] | null
  onFilesConsumed: () => void
}) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('updatedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [myDocs, setMyDocs] = useState<DocumentRecord[]>([])
  const [companyDocs, setCompanyDocs] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploaderOpen, setUploaderOpen] = useState(false)
  const [uploaderFiles, setUploaderFiles] = useState<File[]>([])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 200)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (files && files.length > 0) {
      setUploaderFiles(files)
      setUploaderOpen(true)
      onFilesConsumed()
    }
  }, [files, onFilesConsumed])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [mine, company] = await Promise.all([
        getDocuments({
          scope: 'EMPLOYEE',
          employeeId: userId,
          search: debouncedSearch || undefined,
          sortBy: sortField,
          sortDir,
        }),
        getDocuments({
          scope: 'COMPANY',
          search: debouncedSearch || undefined,
          sortBy: sortField,
          sortDir,
        }),
      ])
      setMyDocs(mine)
      setCompanyDocs(company)
    } finally {
      setLoading(false)
    }
  }, [userId, debouncedSearch, sortField, sortDir])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your documents…"
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <select
            value={`${sortField}|${sortDir}`}
            onChange={(e) => {
              const [f, d] = e.target.value.split('|')
              setSortField(f as SortField)
              setSortDir(d as 'asc' | 'desc')
            }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-foreground focus:outline-none"
          >
            <option value="updatedAt|desc">Recently updated</option>
            <option value="createdAt|desc">Recently uploaded</option>
            <option value="name|asc">Title (A–Z)</option>
            <option value="name|desc">Title (Z–A)</option>
            <option value="mimeType|asc">File type</option>
          </select>
          <Button onClick={() => {
            setUploaderFiles([])
            setUploaderOpen(true)
          }}>
            <Upload className="h-4 w-4" /> Upload
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground p-4">Loading…</p>
      ) : (
        <>
          <Section title="My Documents" docs={myDocs} onChanged={reload} />
          <Section title="Company Documents" docs={companyDocs} onChanged={reload} />
        </>
      )}

      <DocumentUploaderModal
        open={uploaderOpen}
        onOpenChange={setUploaderOpen}
        mode="employee"
        defaultEmployeeId={userId}
        initialFiles={uploaderFiles}
        onUploaded={reload}
      />
    </div>
  )
}

function Section({
  title,
  docs,
  onChanged,
}: {
  title: string
  docs: DocumentRecord[]
  onChanged: () => void
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-2">
        {title}{' '}
        <span className="text-muted-foreground font-normal">({docs.length})</span>
      </h3>
      {docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No documents.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
          {docs.map((d) => (
            <DocRow key={d.id} doc={d} onDeleted={onChanged} />
          ))}
        </ul>
      )}
    </div>
  )
}

// ===================================================================
// Main export — window-level drag-and-drop + role routing
// ===================================================================

export function DocumentsClient({ role, userId, employees }: Props) {
  const isHR = role === 'ADMIN' || role === 'HR'
  const [droppedFiles, setDroppedFiles] = useState<File[] | null>(null)
  const [overlayOn, setOverlayOn] = useState(false)
  const dragCounter = useRef(0)

  // Window-level drag-and-drop. Counter pattern avoids flicker from child elements.
  useEffect(() => {
    function isFileDrag(e: DragEvent): boolean {
      return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    }
    function onEnter(e: DragEvent) {
      if (!isFileDrag(e)) return
      dragCounter.current++
      setOverlayOn(true)
    }
    function onLeave(e: DragEvent) {
      if (!isFileDrag(e)) return
      dragCounter.current = Math.max(0, dragCounter.current - 1)
      if (dragCounter.current === 0) setOverlayOn(false)
    }
    function onOver(e: DragEvent) {
      if (!isFileDrag(e)) return
      e.preventDefault()
    }
    function onDrop(e: DragEvent) {
      if (!isFileDrag(e)) return
      e.preventDefault()
      dragCounter.current = 0
      setOverlayOn(false)
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        setDroppedFiles(Array.from(e.dataTransfer.files))
      }
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 relative">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isHR
            ? 'Browse and manage company-wide and per-employee documents. Drag files anywhere to upload.'
            : 'Your documents and company-shared files. Drag files anywhere to upload to your folder.'}
        </p>
      </div>

      {isHR ? (
        <HRView
          employees={employees}
          files={droppedFiles}
          onFilesConsumed={() => setDroppedFiles(null)}
        />
      ) : (
        <EmployeeView
          userId={userId}
          files={droppedFiles}
          onFilesConsumed={() => setDroppedFiles(null)}
        />
      )}

      {/* Window-wide drop overlay (visible while dragging files) */}
      {overlayOn && (
        <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center bg-primary/5 backdrop-blur-[2px]">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-background/80 px-10 py-8 text-center shadow-lg">
            <Upload className="h-10 w-10 mx-auto text-primary mb-2" />
            <p className="text-base font-medium">Drop to upload</p>
          </div>
        </div>
      )}
    </div>
  )
}
