import { NextRequest, NextResponse } from 'next/server'
import { verifySessionApi, withApiAuth } from '@/lib/dal'
import { putChecked, FileTooLargeError } from '@/lib/storage'

/**
 * Expense receipt upload.
 *
 * Stores the bytes in Postgres and returns the blob id. The old implementation
 * put receipts into `Expenses/Pending Approval` in Drive and then *moved* the
 * file between folders as the claim progressed — a second copy of the claim's
 * status that could disagree with the database. The claim's status is now the
 * only place status lives.
 */

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']

export async function POST(req: NextRequest) {
  return withApiAuth(() => handler(req))
}

async function handler(req: NextRequest) {
  await verifySessionApi()

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const stored = await putChecked(buffer, file.type)
    return NextResponse.json({
      key: stored.blobId,
      blobId: stored.blobId,
      fileName: file.name,
      fileSize: stored.fileSize,
      mimeType: stored.mimeType,
      deduped: stored.deduped,
    })
  } catch (err) {
    if (err instanceof FileTooLargeError) {
      return NextResponse.json({ error: err.message }, { status: 413 })
    }
    throw err
  }
}
