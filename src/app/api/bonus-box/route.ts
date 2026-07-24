import { NextResponse } from 'next/server'
import { BonusBoxError, getBonusBoxOverview, openBonusBox, retryPendingBonusBoxSyncsForUser } from '@/lib/bonus-box'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  if (!await isFeatureEnabled('bonusBox')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const session = await requireAuth()
  await retryPendingBonusBoxSyncsForUser(session.uid)
  const overview = await getBonusBoxOverview(session.uid)
  return NextResponse.json(overview)
})

export const POST = withAuth(async (req: Request) => {
  if (!await isFeatureEnabled('bonusBox')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const session = await requireAuth()
  const limited = await rateLimit(req, `bonus-box-open:${session.uid}`, 8, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много открытий. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  try {
    const result = await openBonusBox(session.uid)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BonusBoxError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }
})
