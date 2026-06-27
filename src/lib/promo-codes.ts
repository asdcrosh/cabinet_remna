import type { Plan, Prisma } from '@prisma/client'

const MIN_PAYMENT_KOPECKS = 100
const ACTIVE_REDEMPTION_STATUSES = ['PENDING', 'SUCCEEDED'] as const

type PromoCodeWithPlans = Prisma.PromoCodeGetPayload<{
  include: { plans: { select: { planId: true } } }
}>

type PromoPrisma = Pick<Prisma.TransactionClient, 'promoCode' | 'promoCodeRedemption' | 'user' | 'subscription'>
type PromoAudiencePrisma = Pick<Prisma.TransactionClient, 'user' | 'subscription'>

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
  plan: Pick<Plan, 'id' | 'priceKopecks'>
  now?: Date
}): Promise<PromoDiscountResult> {
  const normalizedCode = normalizePromoCode(code)
  if (!normalizedCode) {
    throw new PromoCodeError('Введите промокод', 400, 'PROMO_EMPTY')
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
      remnawaveUuid: true,
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

  const subscriptionsCount = await prisma.subscription.count({
    where:
      promoCode.audience === 'NO_ACTIVE_SUBSCRIPTION'
        ? {
            userId,
            status: { in: ['ACTIVE', 'LIMITED'] },
            expireAt: { gt: now },
          }
        : { userId },
  })

  if (promoCode.audience === 'NEW_USERS') {
    if (user.remnashopUserId || user.remnawaveUuid || subscriptionsCount > 0) {
      throw new PromoCodeError('Промокод доступен только новым пользователям', 403, 'PROMO_NEW_USERS_ONLY')
    }
    return
  }

  if (promoCode.audience === 'NO_ACTIVE_SUBSCRIPTION' && subscriptionsCount > 0) {
    throw new PromoCodeError('Промокод доступен только пользователям без активной подписки', 403, 'PROMO_NO_ACTIVE_SUBSCRIPTION_ONLY')
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
