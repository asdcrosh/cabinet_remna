import { NextResponse } from 'next/server'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { claimSeasonalEvent, SeasonalEventError } from '@/lib/seasonal-events'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request, { params }: { params: { key: string } }) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `seasonal-claim:${session.uid}`, 12, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  try {
    const result = await claimSeasonalEvent(session.uid, params.key)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SeasonalEventError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }
})
