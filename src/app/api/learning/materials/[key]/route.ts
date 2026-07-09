import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Serves an admin-uploaded learning material (pptx / pdf bytes).
//
// Deliberately unauthenticated: slide decks are rendered through the
// Microsoft Office Online viewer, which fetches the file itself and cannot
// carry our session cookie. This matches the exposure of the bundled
// defaults, which are served statically from public/materials.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params
  const material = await db.learningMaterial.findUnique({
    where: { key: decodeURIComponent(key) },
  })

  if (!material?.data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const rawName = material.fileName ?? 'material'
  const safeName = rawName.replace(/[^\x20-\x7E]/g, '_')

  return new NextResponse(Buffer.from(material.data), {
    headers: {
      'Content-Type': material.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
      // updatedAt-keyed caching isn't worth it for a demo; just avoid stale decks
      'Cache-Control': 'no-cache',
    },
  })
}
