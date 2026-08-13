import { NextRequest, NextResponse } from 'next/server'
import { verifySessionApi, withApiAuth } from '@/lib/dal'
import { storage } from '@/lib/storage'
import { resolveFileAccess } from '@/lib/fileAccess'
import { createAuditLog } from '@/lib/audit'

/**
 * Serve a stored file.
 *
 * Two things changed here. The bytes now come from Postgres rather than Google
 * Drive, and — more importantly — the route actually checks whether the caller
 * is allowed to see this particular file. It previously required only a session
 * and then streamed any Drive id handed to it, which made every payslip, medical
 * certificate and signed letter in the company readable by anyone who could
 * guess or observe an id.
 *
 * The parameter is still called `fileId` so existing links keep their shape; it
 * now carries a `FileBlob` id. Access rules live in src/lib/fileAccess.ts.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ fileId: string }> }) {
  return withApiAuth(() => handler(req, ctx))
}

async function handler(_req: NextRequest, ctx: { params: Promise<{ fileId: string }> }) {
  const session = await verifySessionApi()
  const { fileId: blobId } = await ctx.params

  const decision = await resolveFileAccess(blobId, session)

  if (!decision.allowed) {
    // Deliberately 404 for both cases: telling an unauthorized caller that a
    // file exists but isn't theirs is itself a disclosure.
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const file = await storage.get(blobId)
  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // Who opened this payslip, and when. Previously unanswerable.
  await createAuditLog({
    userId: session.userId,
    action: 'DOCUMENT_VIEWED',
    entityType: 'DOCUMENT',
    entityId: decision.recordId,
    details: {
      blobId,
      kind: decision.kind,
      category: decision.category ?? null,
      subjectUserId: decision.subjectUserId,
      fileName: decision.fileName,
    },
  })

  // Content-Disposition must be ASCII-safe; `filename*` carries the real name.
  const safeName = decision.fileName.replace(/[^\x20-\x7E]/g, '_')

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.fileSize),
      'Content-Disposition': `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(decision.fileName)}`,
      // Private: this response is authorized per-user and must never land in a
      // shared cache.
      'Cache-Control': 'private, no-store',
    },
  })
}
