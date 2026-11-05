// POST /api/mobile/checkout/quote — точная сумма заказа для приложения StealthNet.
// Считает так же, как POST /api/payment/create: доп. устройства, лучшая из скидок
// (персональная / на следующую покупку / промокод), дополнение «белые списки».
// Ничего не создаёт и не резервирует.
import { z } from 'zod'
import { jsonResponse } from '@/lib/json-response'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { calculatePlanPurchase, DeviceLimitSelectionError } from '@/lib/plan-purchase'
import { PromoCodeError, validatePromoCodeForPlan } from '@/lib/promo-codes'
import { calculateUserDiscount, preferUserDiscount } from '@/lib/user-discounts'
import { tryCalculateRenewalPricing } from '@/lib/renewal-pricing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const quoteSchema = z.object({
  planId: z.string().min(1).max(64),
  deviceLimit: z.coerce.number().int().min(1).max(100).optional(),
  promoCode: z.string().trim().min(1).max(64).optional(),
  whitelistAddon: z.boolean().optional().default(false),
}).strict()

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `checkout-quote:${session.uid}`, 30, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const parsed = quoteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonResponse({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })
  }
  const { planId, deviceLimit, promoCode, whitelistAddon } = parsed.data

  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan || !plan.isActive) {
    return jsonResponse({ error: 'Тариф не найден' }, { status: 404 })
  }
  if (plan.isPromo && promoCode) {
    return jsonResponse({ error: 'Промокод не нужен для этого тарифа' }, { status: 400 })
  }
  if (plan.unlimitedDevices && deviceLimit != null && deviceLimit !== plan.deviceLimit) {
    return jsonResponse({ error: 'В тарифе уже включён безлимит устройств' }, { status: 422 })
  }

  try {
    const pricing = calculatePlanPurchase(plan, plan.unlimitedDevices ? null : deviceLimit)
    const promo = promoCode
      ? await validatePromoCodeForPlan({ prisma, code: promoCode, userId: session.uid, plan })
      : null
    const profile = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { personalDiscountPercent: true, nextPurchaseDiscountPercent: true },
    })
    const automatic = profile && !plan.isPromo ? calculateUserDiscount(plan.priceKopecks, profile) : null
    const { userDiscount, promoDiscount } = preferUserDiscount(automatic, promo)

    const addonAvailable = !plan.isPromo
      && plan.whitelistAddonEnabled
      && plan.whitelistAddonPriceKopecks > 0
      && plan.whitelistAddonInternalSquads.length > 0
    if (whitelistAddon && !addonAvailable) {
      return jsonResponse({ error: 'Дополнение для этого тарифа недоступно' }, { status: 422 })
    }
    const addonPriceKopecks = whitelistAddon ? plan.whitelistAddonPriceKopecks : 0

    const discount = promoDiscount
      ? {
          source: 'PROMO' as const,
          code: promoDiscount.normalizedCode,
          percent: promoDiscount.discountPercent,
          kopecks: promoDiscount.discountKopecks,
        }
      : userDiscount
        ? {
            source: userDiscount.source,
            code: null,
            percent: userDiscount.discountPercent,
            kopecks: userDiscount.discountKopecks,
          }
        : null
    const renewal = plan.isPromo || plan.unlimitedDuration
      ? null
      : tryCalculateRenewalPricing(
          plan,
          pricing.selectedDeviceLimit,
          profile?.personalDiscountPercent ?? 0,
          addonPriceKopecks
        )

    return jsonResponse({
      planId: plan.id,
      deviceLimit: pricing.selectedDeviceLimit,
      basePriceKopecks: plan.priceKopecks,
      extraDeviceCount: pricing.extraDeviceCount,
      extraDeviceAmountKopecks: pricing.extraDeviceAmountKopecks,
      discount,
      // Промокод верный, но персональная скидка выгоднее — применится она.
      promoOutweighed: Boolean(promo && !promoDiscount),
      whitelistAddonKopecks: addonPriceKopecks,
      totalOriginalKopecks: pricing.originalAmountKopecks + addonPriceKopecks,
      totalKopecks: pricing.originalAmountKopecks - (discount?.kopecks ?? 0) + addonPriceKopecks,
      renewalKopecks: renewal?.totalAmountKopecks ?? null,
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
