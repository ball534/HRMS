'use client'

import { useRef, useState, useEffect } from 'react'
import { Camera, FileText, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export type UploadedReceipt = {
  key: string
  fileName: string
  fileSize: number
  mimeType: string
}

type ExistingReceipt = {
  id: string
  fileName: string
  mimeType: string
  url?: string
}

type ReceiptUploaderProps = {
  receipts: UploadedReceipt[]
  onReceiptsChange: (receipts: UploadedReceipt[]) => void
  existingReceipts?: ExistingReceipt[]
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${Math.round(bytes / 1024)} KB`
}

export function ReceiptUploader({ receipts, onReceiptsChange, existingReceipts = [] }: ReceiptUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  // Map of S3 key -> object URL for newly uploaded file previews
  const [previewUrls, setPreviewUrls] = useState<Map<string, string>>(new Map())

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url))
    }
  }, [previewUrls])

  async function handleFilesAdded(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setUploading(true)
    try {
      const newReceipts = await Promise.all(
        files.map(async (file) => {
          // 1. Upload file to Google Drive via API
          const formData = new FormData()
          formData.append('file', file)
          const res = await fetch('/api/expenses/upload-url', {
            method: 'POST',
            body: formData,
          })
          if (!res.ok) throw new Error('Failed to upload receipt')
          const { key, fileName, fileSize, mimeType } = await res.json()

          // 2. Create preview URL for images
          if (file.type.startsWith('image/')) {
            const objectUrl = URL.createObjectURL(file)
            setPreviewUrls(prev => new Map(prev).set(key, objectUrl))
          }

          return { key, fileName: file.name, fileSize: file.size, mimeType: file.type }
        })
      )
      onReceiptsChange([...receipts, ...newReceipts])
    } catch {
      toast.error('Failed to upload receipt')
    } finally {
      setUploading(false)
      // Reset input value so same file can be re-selected
      e.target.value = ''
    }
  }

  function handleRemove(key: string) {
    // Clean up preview URL if exists
    const previewUrl = previewUrls.get(key)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrls(prev => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
    }
    onReceiptsChange(receipts.filter(r => r.key !== key))
  }

  return (
    <div className="space-y-3">
      {/* Hidden file inputs */}
      <input
        type="file"
        accept="image/*,application/pdf"
        multiple
        onChange={handleFilesAdded}
        ref={fileInputRef}
        className="hidden"
      />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFilesAdded}
        ref={cameraInputRef}
        className="hidden"
      />

      {/* Upload buttons */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          Choose File
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
        >
          <Camera className="mr-1.5 h-3.5 w-3.5" />
          Take Photo
        </Button>
        {uploading && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Uploading...
          </div>
        )}
      </div>

      {/* Existing receipts (non-removable, already saved to DB) */}
      {existingReceipts.length > 0 && (
        <div className="space-y-2">
          {existingReceipts.map(receipt => (
            <div
              key={receipt.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-muted/10 px-3 py-2"
            >
              {receipt.mimeType.startsWith('image/') ? (
                receipt.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={receipt.url}
                    alt={receipt.fileName}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                )
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <span className="flex-1 truncate text-sm text-muted-foreground">{receipt.fileName}</span>
              <span className="text-xs text-muted-foreground">Saved</span>
            </div>
          ))}
        </div>
      )}

      {/* Newly uploaded receipts (removable) */}
      {receipts.length > 0 && (
        <div className="space-y-2">
          {receipts.map(receipt => (
            <div
              key={receipt.key}
              className="flex items-center gap-3 rounded-lg border border-border bg-muted/10 px-3 py-2"
            >
              {receipt.mimeType.startsWith('image/') && previewUrls.get(receipt.key) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrls.get(receipt.key)!}
                  alt={receipt.fileName}
                  className="h-10 w-10 rounded object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex flex-1 flex-col overflow-hidden">
                <span className="truncate text-sm">{receipt.fileName}</span>
                <span className="text-xs text-muted-foreground">{formatFileSize(receipt.fileSize)}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(receipt.key)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Remove receipt"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {receipts.length === 0 && existingReceipts.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Supported formats: JPEG, PNG, WEBP, HEIC, PDF
        </p>
      )}
    </div>
  )
}
