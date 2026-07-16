import type { Plan, Prisma } from '@prisma/client'
import { logWarn } from './logger'
import { remnashopQuery } from './remnashop-db'

const MIN_PAYMENT_KOPECKS = 100
const ACTIVE_REDEMPTION_STATUSES = ['PENDING', 'SUCCEEDED'] as const

type PromoCodeWithPlans = Prisma.PromoCodeGetPayload<{
  include: { plans: { select: { planId: true } } }
}>

type PromoPrisma = Pick<Prisma.TransactionClient, 'promoCode' | 'promoCodeRedemption' | 'user' | 'subscription' | 'payment'>
type PromoAudiencePrisma = Pick<Prisma.TransactionClient, 'user' | 'subscription' | 'payment'>

export class PromoCodeError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'PROMO_INVALID'
  ) {
    super(message)
    this.name = 'PromoCodeError'
  }
}

export interface PromoDiscountResult {
  promoCode: PromoCodeWithPlans
  normalizedCode: string
  originalAmountKopecks: number
  discountPercent: number
  discountKopecks: number
  finalAmountKopecks: number
}

export function normalizePromoCode(code: string | null | undefined) {
  const normalized = code?.trim().toUpperCase()
  return normalized || null
}

export function calculatePercentDiscount(amountKopecks: number, discountPercent: number) {
  if (discountPercent < 1 || discountPercent > 99) {
    throw new PromoCodeError('Скидка должна быть от 1% до 99%', 400, 'PROMO_PERCENT_INVALID')
  }
  if (amountKopecks <= MIN_PAYMENT_KOPECKS) {
    throw new PromoCodeError('Промокод нельзя применить к этому тарифу', 400, 'PROMO_AMOUNT_TOO_LOW')
  }

  const rawDiscount = Math.floor((amountKopecks * discountPercent) / 100)
  const discountKopecks = Math.min(rawDiscount, amountKopecks - MIN_PAYMENT_KOPECKS)

  return {
    discountKopecks,
    finalAmountKopecks: amountKopecks - discountKopecks,
  }
}

export async function validatePromoCodeForPlan({
  prisma,
  code,
  userId,
  plan,
  now = new Date(),
}: {
  prisma: PromoPrisma
  code: string
  userId: string
  plan: Pick<Plan, 'id' | 'priceKopecks' | 'promoCodesEnabled'>
  now?: Date
}): Promise<PromoDiscountResult> {
  const normalizedCode = normalizePromoCode(code)
  if (!normalizedCode) {
    throw new PromoCodeError('Введите промокод', 400, 'PROMO_EMPTY')
  }
  if (!plan.promoCodesEnabled) {
    throw new PromoCodeError('Промокоды не действуют на этот тариф', 400, 'PROMO_DISABLED_FOR_PLAN')
  }

  const promoCode = await prisma.promoCode.findUnique({
    where: { code: normalizedCode },
    include: { plans: { select: { planId: true } } },
  })

  if (!promoCode) {
    throw new PromoCodeError('Промокод не найден', 404, 'PROMO_NOT_FOUND')
  }
  assertPromoCodeCanBeUsed(promoCode, plan.id, now)
  await assertPromoCodeAudienceCanBeUsed({
    prisma,
    promoCode,
    userId,
    now,
  })

  const [totalReserved, userReserved] = await Promise.all([
    promoCode.maxUses == null
      ? Promise.resolve(0)
      : prisma.promoCodeRedemption.count({
          where: {
            promoCodeId: promoCode.id,
            status: { in: [...ACTIVE_REDEMPTION_STATUSES] },
          },
        }),
    prisma.promoCodeRedemption.count({
      where: {
        promoCodeId: promoCode.id,
        userId,
        status: { in: [...ACTIVE_REDEMPTION_STATUSES] },
      },
    }),
  ])

  if (promoCode.maxUses != null && totalReserved >= promoCode.maxUses) {
    throw new PromoCodeError('Лимит использований промокода исчерпан', 409, 'PROMO_LIMIT_REACHED')
  }
  if (userReserved >= promoCode.maxUsesPerUser) {
    throw new PromoCodeError('Вы уже использовали этот промокод', 409, 'PROMO_USER_LIMIT_REACHED')
  }

  const { discountKopecks, finalAmountKopecks } = calculatePercentDiscount(
    plan.priceKopecks,
    promoCode.discountPercent
  )

  return {
    promoCode,
    normalizedCode,
    originalAmountKopecks: plan.priceKopecks,
    discountPercent: promoCode.discountPercent,
    discountKopecks,
    finalAmountKopecks,
  }
}

async function assertPromoCodeAudienceCanBeUsed({
  prisma,
  promoCode,
  userId,
  now,
}: {
  prisma: PromoAudiencePrisma
  promoCode: Pick<PromoCodeWithPlans, 'audience' | 'allowedEmails'>
  userId: string
  now: Date
}) {
  if (promoCode.audience === 'ALL') return

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      remnashopUserId: true,
    },
  })

  if (!user) {
    throw new PromoCodeError('Пользователь не найден', 404, 'PROMO_USER_NOT_FOUND')
  }

  if (promoCode.audience === 'PERSONAL') {
    const allowedEmails = new Set(promoCode.allowedEmails.map((email) => email.trim().toLowerCase()))
    if (!allowedEmails.has(user.email.toLowerCase())) {
      throw new PromoCodeError('Промокод доступен только выбранным пользователям', 403, 'PROMO_USER_NOT_ALLOWED')
    }
    return
  }

  if (promoCode.audience === 'NEW_USERS') {
    const [subscriptionsCount, succeededPaymentsCount, hasRemnashopHistory] = await Promise.all([
      prisma.subscription.count({ where: { userId } }),
      prisma.payment.count({ where: { userId, status: 'SUCCEEDED' } }),
      hasRemnashopPurchaseHistory(user.remnashopUserId),
    ])

    if (subscriptionsCount > 0 || succeededPaymentsCount > 0 || hasRemnashopHistory) {
      throw new PromoCodeError('Промокод доступен только новым пользователям', 403, 'PROMO_NEW_USERS_ONLY')
    }
    return
  }

  const subscriptionsCount = await prisma.subscription.count({
    where: {
      userId,
      status: { in: ['ACTIVE', 'LIMITED'] },
      expireAt: { gt: now },
    },
  })

  if (promoCode.audience === 'NO_ACTIVE_SUBSCRIPTION' && subscriptionsCount > 0) {
    throw new PromoCodeError('Промокод доступен только пользователям без активной подписки', 403, 'PROMO_NO_ACTIVE_SUBSCRIPTION_ONLY')
  }
}

async function hasRemnashopPurchaseHistory(remnashopUserId: number | null) {
  if (!remnashopUserId || !process.env.REMNASHOP_DATABASE_URL) return false

  try {
    const result = await remnashopQuery<{ has_history: boolean }>(
      `
        SELECT (
          EXISTS (
            SELECT 1
            FROM subscriptions s
            WHERE s.user_id = $1
          )
          OR EXISTS (
            SELECT 1
            FROM transactions t
            WHERE t.user_id = $1
              AND upper(t.status::text) IN ('COMPLETED', 'SUCCEEDED', 'SUCCESS', 'PAID')
          )
        ) AS has_history
      `,
      [remnashopUserId]
    )
    return Boolean(result.rows[0]?.has_history)
  } catch (error) {
    logWarn('promo_codes.remnashop_new_user_check_failed', {
      remnashopUserId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return false
  }
}

export function assertPromoCodeCanBeUsed(
  promoCode: Pick<
    PromoCodeWithPlans,
    'isActive' | 'startsAt' | 'expiresAt' | 'discountPercent' | 'plans'
  >,
  planId: string,
  now = new Date()
) {
  if (!promoCode.isActive) {
    throw new PromoCodeError('Промокод отключён', 400, 'PROMO_INACTIVE')
  }
  if (promoCode.startsAt && promoCode.startsAt > now) {
    throw new PromoCodeError('Промокод ещё не активен', 400, 'PROMO_NOT_STARTED')
  }
  if (promoCode.expiresAt && promoCode.expiresAt < now) {
    throw new PromoCodeError('Срок действия промокода истёк', 400, 'PROMO_EXPIRED')
  }
  if (promoCode.discountPercent < 1 || promoCode.discountPercent > 99) {
    throw new PromoCodeError('Промокод настроен некорректно', 400, 'PROMO_PERCENT_INVALID')
  }
  if (promoCode.plans.length > 0 && !promoCode.plans.some((plan) => plan.planId === planId)) {
    throw new PromoCodeError('Промокод не действует на этот тариф', 400, 'PROMO_PLAN_NOT_ALLOWED')
  }
}
