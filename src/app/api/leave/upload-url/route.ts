import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/dal'
import { uploadFile } from '@/lib/google-drive'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await verifySession()

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { firstName: true, lastName: true },
  })
  const employeeName = user ? `${user.firstName} ${user.lastName}` : 'Unknown'

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileName = `${employeeName} - ${new Date().toISOString().slice(0, 10)} - ${file.name}`

  const { fileId } = await uploadFile(
    buffer,
    fileName,
    file.type,
    ['Documents', employeeName, 'Leave Attachments'],
  )

  return NextResponse.json({
    key: fileId,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  })
}
