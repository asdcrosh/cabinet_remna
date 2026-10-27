import { jsonResponse } from '@/lib/json-response'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { validatePromoCodeSchema } from '@/lib/auth/validation'
import { PromoCodeError, validatePromoCodeForPlan } from '@/lib/promo-codes'
import { rateLimit } from '@/lib/rate-limit'
import { calculatePlanPurchase, DeviceLimitSelectionError } from '@/lib/plan-purchase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `promo-validate:${session.uid}`, 30, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много проверок промокода. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = validatePromoCodeSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const plan = await prisma.plan.findUnique({ where: { id: parsed.data.planId } })
  if (!plan || !plan.isActive) {
    return jsonResponse({ error: 'Тариф не найден' }, { status: 404 })
  }

  if (
    plan.unlimitedDevices
    && parsed.data.deviceLimit != null
    && parsed.data.deviceLimit !== plan.deviceLimit
  ) {
    return jsonResponse(
      { error: 'В тарифе уже включён безлимит устройств' },
      { status: 422 }
    )
  }

  if (
    !plan.deviceAddonEnabled
    && parsed.data.deviceLimit != null
    && parsed.data.deviceLimit > plan.deviceLimit
  ) {
    const currentSubscription = await prisma.subscription.findFirst({
      where: {
        userId: session.uid,
        planId: plan.id,
        status: { in: ['ACTIVE', 'LIMITED'] },
        expireAt: { gt: new Date() },
      },
      orderBy: { expireAt: 'desc' },
      select: { deviceLimit: true },
    })
    const allowedDeviceLimit = currentSubscription?.deviceLimit ?? plan.deviceLimit
    if (parsed.data.deviceLimit > allowedDeviceLimit) {
      return jsonResponse(
        { error: 'Дополнительные устройства для этого тарифа недоступны' },
        { status: 422 }
      )
    }
  }

  try {
    const pricing = calculatePlanPurchase(plan, parsed.data.deviceLimit)
    const discount = await validatePromoCodeForPlan({
      prisma,
      code: parsed.data.promoCode,
      userId: session.uid,
      plan,
    })

    return jsonResponse({
      code: discount.normalizedCode,
      discountPercent: discount.discountPercent,
      discountKopecks: discount.discountKopecks,
      originalAmountKopecks: pricing.originalAmountKopecks,
      finalAmountKopecks: pricing.originalAmountKopecks - discount.discountKopecks,
    })
  } catch (e) {
    if (e instanceof DeviceLimitSelectionError) {
      return jsonResponse({ error: e.message, code: e.code }, { status: 400 })
    }
    if (e instanceof PromoCodeError) {
      return jsonResponse({ error: e.message, code: e.code }, { status: e.status })
    }
    throw e
  }
})
