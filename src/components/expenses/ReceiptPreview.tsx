'use client'

import { FileText } from 'lucide-react'

type ReceiptPreviewProps = {
  receipt: {
    url: string
    mimeType: string
    fileName: string
  }
}

export function ReceiptPreview({ receipt }: ReceiptPreviewProps) {
  const { url, mimeType, fileName } = receipt

  if (mimeType.startsWith('image/')) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={fileName}
        className="max-h-96 w-full object-contain rounded-lg"
      />
    )
  }

  if (mimeType === 'application/pdf') {
    return (
      <div className="space-y-2">
        {/* Desktop: iframe */}
        <iframe
          src={url}
          className="hidden md:block w-full h-96 rounded-lg border border-border"
          title={fileName}
        />
        {/* Always visible: download link (required for iOS Safari which cannot render PDFs in iframes) */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 hover:underline"
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">{fileName}</span>
          <span className="shrink-0 text-muted-foreground">— Open PDF</span>
        </a>
      </div>
    )
  }

  // Fallback for other file types
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 hover:underline"
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate">{fileName}</span>
      <span className="shrink-0 text-muted-foreground">— Download</span>
    </a>
  )
}
