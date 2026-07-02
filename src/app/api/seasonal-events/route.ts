import { NextResponse } from 'next/server'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { getSeasonalEventsForUser } from '@/lib/seasonal-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  const session = await requireAuth()
  const events = await getSeasonalEventsForUser(session.uid)
  return NextResponse.json({ events })
})
