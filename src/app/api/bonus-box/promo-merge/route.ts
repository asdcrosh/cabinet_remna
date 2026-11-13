import { z } from 'zod'
import { jsonResponse } from '@/lib/json-response'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { getPromoMergeSettings } from '@/lib/bonus-box'
import {
  mergePromoCodes,
  PROMO_MERGE_MAX_CODES,
  PromoMergeError,
} from '@/lib/promo-code-merge'
import { deactivateCabinetPromoCodesInRemnashopBestEffort } from '@/lib/remnashop-promo-sync'
import { writeAuditLog } from '@/lib/audit-log'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const mergeSchema = z.object({
  promoCodeIds: z.array(z.string().trim().min(1).max(80)).min(1).max(PROMO_MERGE_MAX_CODES),
  idempotencyKey: z.string().uuid(),
}).strict()

export const POST = withAuth(async (req: Request) => {
  if (!await isFeatureEnabled('bonusBox')) return jsonResponse({ error: 'Not found' }, { status: 404 })
  const session = await requireAuth()

  const limited = await rateLimit(req, `promo-merge:${session.uid}`, 10, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много попыток. Попробуйте позже.', code: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter ?? 60) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Некорректный запрос', code: 'INVALID_REQUEST' }, { status: 400 })
  }
  const parsed = mergeSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse({ error: 'Некорректный запрос', code: 'INVALID_REQUEST' }, { status: 400 })
  }

  try {
    const settings = await getPromoMergeSettings()
    const result = await mergePromoCodes({
      userId: session.uid,
      promoCodeIds: parsed.data.promoCodeIds,
      idempotencyKey: parsed.data.idempotencyKey,
      settings,
    })

    if (!result.replayed) {
      const merge = await prisma.promoCodeMerge.findUnique({
        where: { resultPromoCodeId: result.promoCode.id },
        select: { sourceCodes: true },
      })
      // Исходные коды рулетки выгружены в бот — выключаем их и там.
      await deactivateCabinetPromoCodesInRemnashopBestEffort(merge?.sourceCodes ?? [])
      await writeAuditLog({
        actorId: session.uid,
        targetId: session.uid,
        action: 'PROMO_CODE_MERGED',
        message: `Промокоды объединены: ${result.sourcePercents.join(' + ')}% → ${result.promoCode.discountPercent}%`,
        metadata: {
          resultPromoCodeId: result.promoCode.id,
          sourcePercents: result.sourcePercents,
          discountPercent: result.promoCode.discountPercent,
        },
        request: req,
      })
    }

    return jsonResponse(result)
  } catch (error) {
    if (error instanceof PromoMergeError) {
      return jsonResponse({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }
})
