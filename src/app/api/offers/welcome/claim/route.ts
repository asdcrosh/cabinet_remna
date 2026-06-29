import { NextResponse } from 'next/server'
import { Prisma, type Plan, type PromoCode, type WelcomeBonusSetting } from '@prisma/client'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { provisionPaymentSubscription } from '@/lib/provisioning'
import { getBonusBoxConfig } from '@/lib/bonus-box'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `welcome-offer:${session.uid}`, 5, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const setting = await prisma.welcomeBonusSetting.findUnique({
    where: { id: 'default' },
    include: { trialPlan: true, promoCode: true },
  })
  if (!setting?.enabled || setting.type === 'NONE') {
    return NextResponse.json({ error: 'Приветственный бонус сейчас недоступен' }, { status: 404 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      remnashopUserId: true,
      remnawaveUuid: true,
      subscriptions: { select: { id: true }, take: 1 },
      payments: { where: { status: 'SUCCEEDED' }, select: { id: true }, take: 1 },
      trialPlanRedemptions: { select: { id: true }, take: 1 },
      welcomeBonusRedemptions: { select: { id: true }, take: 1 },
    },
  })
  if (!user) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  if (!user.emailVerifiedAt || user.email.endsWith('@pending.invalid')) {
    return NextResponse.json({ error: 'Подтвердите email, чтобы получить приветственный бонус' }, { status: 403 })
  }
  if (
    user.remnashopUserId ||
    user.remnawaveUuid ||
    user.subscriptions.length > 0 ||
    user.payments.length > 0 ||
    user.trialPlanRedemptions.length > 0 ||
    user.welcomeBonusRedemptions.length > 0
  ) {
    return NextResponse.json({ error: 'Приветственный бонус доступен только новым пользователям' }, { status: 409 })
  }

  if (setting.type === 'TRIAL_PLAN') {
    return claimTrialPlan({ userId: user.id, email: user.email, setting })
  }

  if (setting.type === 'PROMO_CODE') {
    return claimPromoCode({ userId: user.id, setting })
  }

  return claimBonusAttempts({ userId: user.id, setting })
})

async function claimTrialPlan({
  userId,
  email,
  setting,
}: {
  userId: string
  email: string
  setting: WelcomeBonusSetting & { trialPlan: Plan | null }
}) {
  const plan = setting.trialPlan
  if (!plan || !plan.isActive || !plan.isPromo) {
    return NextResponse.json({ error: 'Пробный тариф для бонуса не настроен' }, { status: 409 })
  }

  let paymentId: string
  try {
    const payment = await prisma.$transaction(
      async (tx) => {
        const createdPayment = await tx.payment.create({
          data: {
            userId,
            planId: plan.id,
            amountKopecks: 0,
            originalAmountKopecks: plan.priceKopecks,
            discountKopecks: plan.priceKopecks,
            status: 'SUCCEEDED',
            paidAt: new Date(),
            promoCodeSnapshot: {
              type: 'welcome_trial',
              offerId: setting.id,
              planId: plan.id,
            },
          },
        })

        await tx.trialPlanRedemption.create({
          data: {
            userId,
            planId: plan.id,
            paymentId: createdPayment.id,
          },
        })

        await tx.welcomeBonusRedemption.create({
          data: {
            userId,
            type: 'TRIAL_PLAN',
            settingId: setting.id,
            paymentId: createdPayment.id,
            metadata: { planId: plan.id },
          },
        })

        return createdPayment
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
    paymentId = payment.id
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Вы уже получили пробный период' }, { status: 409 })
    }
    throw error
  }

  try {
    await provisionPaymentSubscription({
      userId,
      email,
      paymentId,
      plan: {
        id: plan.id,
        name: plan.name,
        durationDays: plan.durationDays,
        trafficLimitGb: plan.trafficLimitGb,
        deviceLimit: plan.deviceLimit,
        activeInternalSquads: plan.activeInternalSquads,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'welcome trial provisioning failed'
    await prisma.payment.update({
      where: { id: paymentId },
      data: { provisioningError: message.slice(0, 1000) },
    })
    return NextResponse.json(
      {
        type: 'TRIAL_PLAN',
        redirectUrl: `/dashboard/billing?paid=1&payment=${paymentId}`,
        message: 'Пробный период принят, подписка выдаётся',
      },
      { status: 202 }
    )
  }

  return NextResponse.json({
    type: 'TRIAL_PLAN',
    redirectUrl: '/dashboard/subscription?activated=1',
    message: 'Пробный период активирован',
  })
}

async function claimBonusAttempts({
  userId,
  setting,
}: {
  userId: string
  setting: { id: string; bonusAttempts: number }
}) {
  const config = getBonusBoxConfig()
  if (!config.enabled) {
    return NextResponse.json({ error: 'Подарочный бокс сейчас недоступен' }, { status: 403 })
  }

  const attemptsCount = Math.max(1, Math.min(50, setting.bonusAttempts))
  const expiresAt =
    config.attemptTtlDays > 0
      ? new Date(Date.now() + config.attemptTtlDays * 24 * 60 * 60 * 1000)
      : null
  let count = 0
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.welcomeBonusRedemption.create({
        data: {
          userId,
          type: 'BONUS_BOX_ATTEMPTS',
          settingId: setting.id,
          metadata: { attemptsCount },
        },
      })
      return tx.bonusBoxAttempt.createMany({
        data: Array.from({ length: attemptsCount }, (_, index) => ({
          userId,
          source: 'MANUAL',
          sourceKey: `welcome:${setting.id}:${index + 1}`,
          expiresAt,
        })),
        skipDuplicates: true,
      })
    })
    count = result.count
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Вы уже получили приветственный бонус' }, { status: 409 })
    }
    throw error
  }

  if (count === 0) {
    return NextResponse.json({ error: 'Вы уже получили приветственный бонус' }, { status: 409 })
  }

  return NextResponse.json({
    type: 'BONUS_BOX_ATTEMPTS',
    redirectUrl: '/dashboard/bonus-box',
    message: `Начислено открытий: ${count}`,
  })
}

async function claimPromoCode({
  userId,
  setting,
}: {
  userId: string
  setting: WelcomeBonusSetting & { promoCode: PromoCode | null }
}) {
  const promoCode = setting.promoCode
  if (!promoCode || !promoCode.isActive) {
    return NextResponse.json({ error: 'Промокод для бонуса не настроен' }, { status: 409 })
  }

  try {
    await prisma.welcomeBonusRedemption.create({
      data: {
        userId,
        type: 'PROMO_CODE',
        settingId: setting.id,
        promoCodeId: promoCode.id,
        metadata: { code: promoCode.code, discountPercent: promoCode.discountPercent },
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Вы уже получили приветственный бонус' }, { status: 409 })
    }
    throw error
  }

  return NextResponse.json({
    type: 'PROMO_CODE',
    redirectUrl: `/dashboard/plans?promo=${encodeURIComponent(promoCode.code)}`,
    message: `Промокод ${promoCode.code} готов`,
  })
}
