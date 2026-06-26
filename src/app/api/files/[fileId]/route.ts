import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/dal'
import { google } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/drive']

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
    clientOptions: {
      subject: process.env.GOOGLE_IMPERSONATE_EMAIL || 'jin@tictag.io',
    },
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  // Require authenticated user
  await verifySession()

  const { fileId } = await params

  try {
    const drive = google.drive({ version: 'v3', auth: getAuth() })

    // Get file metadata for content type
    const meta = await drive.files.get({
      fileId,
      fields: 'mimeType, name',
      supportsAllDrives: true,
    })

    // Download file content
    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    )

    const buffer = Buffer.from(res.data as ArrayBuffer)

    // Sanitize filename for Content-Disposition header (must be ASCII-safe)
    const rawName = meta.data.name ?? 'file'
    const safeName = rawName.replace(/[^\x20-\x7E]/g, '_')

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': meta.data.mimeType ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    console.error(`File proxy error for fileId=${fileId}:`, err)
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
