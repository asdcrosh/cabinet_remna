import { jsonResponse } from '@/lib/json-response'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { claimBonusBoxMission } from '@/lib/bonus-box-engagement'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!await isFeatureEnabled('bonusBox')) {
    return jsonResponse({ error: 'Not found' }, { status: 404 })
  }
  const session = await requireAuth()
  const limited = await rateLimit(req, `bonus-mission:${session.uid}`, 10, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const { id } = await params
  try {
    const result = await claimBonusBoxMission(session.uid, id)
    return jsonResponse(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось получить награду'
    const status = message.includes('недоступно') ? 404 : 409
    return jsonResponse({ error: message }, { status })
  }
})
