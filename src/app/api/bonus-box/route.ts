import { NextResponse } from 'next/server'
import { z } from 'zod'
import { BonusBoxError, getBonusBoxOverview, openBonusBox, retryPendingBonusBoxSyncsForUser } from '@/lib/bonus-box'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { assessBonusBoxRisk, BonusBoxRiskError } from '@/lib/bonus-box-engagement'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BONUS_BOX_RATE_LIMIT_COOLDOWN_SECONDS = 60

const openSchema = z.object({
  spinId: z.string().uuid(),
}).strict()

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
  const limited = await rateLimit(
    req,
    `bonus-box-open:${session.uid}`,
    8,
    60_000,
    { penaltyMs: BONUS_BOX_RATE_LIMIT_COOLDOWN_SECONDS * 1_000 }
  )
  if (!limited.ok) {
    const retryAfter = Math.max(BONUS_BOX_RATE_LIMIT_COOLDOWN_SECONDS, limited.retryAfter ?? 0)
    return NextResponse.json(
      {
        error: 'Слишком много открытий. Попробуйте позже.',
        retryAfter,
      },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный запрос', code: 'INVALID_SPIN_ID' }, { status: 400 })
    }
    const parsed = openSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Некорректный идентификатор вращения', code: 'INVALID_SPIN_ID' }, { status: 400 })
    }

    await assessBonusBoxRisk(session.uid, req)
    const result = await openBonusBox(session.uid, parsed.data.spinId)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BonusBoxError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    if (error instanceof BonusBoxRiskError) {
      return NextResponse.json(
        { error: error.message, code: 'BONUS_RISK_REVIEW', score: error.score },
        { status: 403 }
      )
    }
    throw error
  }
})
