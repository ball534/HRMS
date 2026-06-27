import { NextRequest, NextResponse } from 'next/server'
import { runDailyReminders } from '@/lib/reminders'

// Daily reminder sweep. On Vercel Cron the request carries
// `Authorization: Bearer <CRON_SECRET>` automatically when CRON_SECRET is set.
// For manual/local runs, pass ?secret=<CRON_SECRET>.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // not configured -> allow (local/dev)
  const header = req.headers.get('authorization')
  if (header === `Bearer ${secret}`) return true
  if (req.nextUrl.searchParams.get('secret') === secret) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const summary = await runDailyReminders()
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), summary })
  } catch (err) {
    console.error('cron/daily error:', err)
    return NextResponse.json({ ok: false, error: 'Reminder run failed' }, { status: 500 })
  }
}
