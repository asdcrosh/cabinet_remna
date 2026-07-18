// POST /api/payment/create — создаёт платёж у выбранного провайдера и возвращает URL для редиректа.
// Вызывается из UI страницы /plans.

import { NextResponse } from 'next/server'
import { Prisma, type Payment } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { createPaymentSchema } from '@/lib/auth/validation'
import { createPayment } from '@/lib/yookassa'
import { isPaymentProviderAvailable } from '@/lib/payment-providers'
import { PromoCodeError, validatePromoCodeForPlan } from '@/lib/promo-codes'
import { getAppUrl } from '@/lib/app-url'
import { rateLimit } from '@/lib/rate-limit'
import { provisionPaymentSubscription } from '@/lib/provisioning'
import { getPlanAudienceContext, isPlanAvailableForUser } from '@/lib/plan-access'
import { reconcileStalePendingPaymentsForUser } from '@/lib/payment-sync'
import { logError } from '@/lib/logger'
import { buildPaymentServiceName } from '@/lib/payment-service-name'

export const runtime = 'nodejs'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `payment-create:${session.uid}`, 10, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток оплаты. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = createPaymentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const { planId, promoCode, provider } = parsed.data

  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: 'Тариф не найден' }, { status: 404 })
  }
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  await reconcileStalePendingPaymentsForUser(user.id)
  const audienceContext = await getPlanAudienceContext(user.id)
  if (!audienceContext || !isPlanAvailableForUser(plan, audienceContext, { allowLink: plan.availability === 'LINK' })) {
    return NextResponse.json({ error: 'Этот тариф недоступен для вашего аккаунта' }, { status: 403 })
  }
  if (plan.priceKopecks <= 0 && !plan.isPromo) {
    return NextResponse.json(
      { error: 'Бесплатный тариф должен быть настроен как ознакомительный.' },
      { status: 400 }
    )
  }

  if (plan.isPromo) {
    if (promoCode) {
      return NextResponse.json({ error: 'Промокод не нужен для этого тарифа' }, { status: 400 })
    }

    const hasAnySubscription = await prisma.subscription.count({
      where: { userId: user.id },
    })

    if (!user.telegramId) {
      return NextResponse.json(
        { error: 'Ознакомительный тариф доступен после привязки Telegram' },
        { status: 403 }
      )
    }

    if (!user.remnashopSyncedAt) {
      return NextResponse.json(
        { error: 'Сначала проверьте старую подписку через Telegram' },
        { status: 403 }
      )
    }

    if (user.remnashopUserId || user.remnawaveUuid || hasAnySubscription > 0) {
      return NextResponse.json({ error: 'Ознакомительный тариф доступен только новым пользователям' }, { status: 409 })
    }

    const existingTrial = await prisma.trialPlanRedemption.findUnique({
      where: { userId_planId: { userId: user.id, planId: plan.id } },
      include: { payment: true },
    })

    if (existingTrial?.payment.subscriptionProvisionedAt) {
      return NextResponse.json({ error: 'Вы уже использовали этот ознакомительный тариф' }, { status: 409 })
    }

    if (existingTrial?.payment.status === 'SUCCEEDED') {
      return provisionPromoPayment(existingTrial.payment, user, plan)
    }

    let promoPayment: Payment
    try {
      promoPayment = await prisma.$transaction(
        async (tx) => {
          const payment = await tx.payment.create({
            data: {
              userId: user.id,
              planId: plan.id,
              amountKopecks: 0,
              originalAmountKopecks: plan.priceKopecks,
              discountKopecks: plan.priceKopecks,
              provider: 'LOCAL',
              providerStatus: 'succeeded',
              status: 'SUCCEEDED',
              paidAt: new Date(),
            },
          })

          await tx.trialPlanRedemption.create({
            data: {
              userId: user.id,
              planId: plan.id,
              paymentId: payment.id,
            },
          })

          return payment
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return NextResponse.json({ error: 'Вы уже использовали этот ознакомительный тариф' }, { status: 409 })
      }
      throw e
    }

    return provisionPromoPayment(promoPayment, user, plan)
  }

  if (!(await isPaymentProviderAvailable(provider))) {
    return NextResponse.json(
      { error: provider === 'PAYANYWAY' ? 'PayAnyWay пока не настроен' : 'ЮKassa пока не настроена' },
      { status: 503 }
    )
  }

  let localPayment: Payment
  let appliedPromo: Awaited<ReturnType<typeof validatePromoCodeForPlan>> | null = null
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const discount = promoCode
          ? await validatePromoCodeForPlan({
              prisma: tx,
              code: promoCode,
              userId: user.id,
              plan,
            })
          : null

        const payment = await tx.payment.create({
          data: {
            userId: user.id,
            planId: plan.id,
            promoCodeId: discount?.promoCode.id,
            amountKopecks: discount?.finalAmountKopecks ?? plan.priceKopecks,
            originalAmountKopecks: plan.priceKopecks,
            discountPercent: discount?.discountPercent,
            discountKopecks: discount?.discountKopecks ?? 0,
            promoCodeSnapshot: discount
              ? {
                  code: discount.normalizedCode,
                  discountPercent: discount.discountPercent,
                  discountKopecks: discount.discountKopecks,
                  originalAmountKopecks: discount.originalAmountKopecks,
                  finalAmountKopecks: discount.finalAmountKopecks,
                }
              : undefined,
            provider,
            providerStatus: 'pending',
            status: 'PENDING',
          },
        })

        if (discount) {
          await tx.promoCodeRedemption.create({
            data: {
              promoCodeId: discount.promoCode.id,
              userId: user.id,
              paymentId: payment.id,
              codeSnapshot: discount.normalizedCode,
              discountPercent: discount.discountPercent,
              discountKopecks: discount.discountKopecks,
              originalAmountKopecks: discount.originalAmountKopecks,
              finalAmountKopecks: discount.finalAmountKopecks,
            },
          })
        }

        return { payment, discount }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
    localPayment = result.payment
    appliedPromo = result.discount
  } catch (e) {
    if (e instanceof PromoCodeError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
    }
    throw e
  }

  const amountRub = localPayment.amountKopecks / 100
  const baseUrl = getAppUrl()
  const returnUrl = `${baseUrl}/dashboard/billing?paid=1&payment=${localPayment.id}`
  const description = buildPaymentServiceName(plan.durationDays)

  if (provider === 'PAYANYWAY') {
    try {
      const confirmationUrl = `${baseUrl}/api/payment/payanyway/redirect?payment=${encodeURIComponent(localPayment.id)}`
      await prisma.payment.update({
        where: { id: localPayment.id },
        data: { confirmationUrl },
      })
      return NextResponse.json({
        confirmationUrl,
        paymentId: localPayment.id,
        localPaymentId: localPayment.id,
        provider,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'PayAnyWay create payment failed'
      await cancelFailedLocalPayment(localPayment.id, message)
      logError('payment.create.payanyway_failed', e, { localPaymentId: localPayment.id })
      return NextResponse.json(
        {
          error: 'PayAnyWay не удалось создать ссылку на оплату. Проверьте номер счёта и код проверки целостности.',
          details: process.env.NODE_ENV === 'development' ? message : undefined,
        },
        { status: 502 }
      )
    }
  }

  let payment
  try {
    payment = await createPayment({
      amount: amountRub,
      description,
      returnUrl,
      metadata: {
        userId: user.id,
        planId: plan.id,
        localPaymentId: localPayment.id,
        ...(appliedPromo
          ? {
              promoCode: appliedPromo.normalizedCode,
              discountKopecks: String(appliedPromo.discountKopecks),
            }
          : {}),
      },
      idempotenceKey: localPayment.id,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'YooKassa createPayment failed'
    await cancelFailedLocalPayment(localPayment.id, message)
    logError('payment.create.yookassa_failed', e, { localPaymentId: localPayment.id })
    return NextResponse.json(
      {
        error:
          'ЮKassa не приняла shopId/secretKey. Проверьте, что в .env указаны API-ключи магазина, а не OAuth/токен другого типа.',
        details: process.env.NODE_ENV === 'development' ? message : undefined,
      },
      { status: 502 }
    )
  }

  await prisma.payment.update({
    where: { id: localPayment.id },
    data: {
      yookassaId: payment.id,
      yookassaStatus: payment.status,
      externalPaymentId: payment.id,
      providerStatus: payment.status,
      confirmationUrl: payment.confirmation?.confirmation_url ?? null,
    },
  })

  return NextResponse.json({
    confirmationUrl: payment.confirmation?.confirmation_url,
    paymentId: payment.id,
    localPaymentId: localPayment.id,
    provider,
  })
})

async function cancelFailedLocalPayment(paymentId: string, message: string) {
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'CANCELED',
        providerStatus: 'failed',
        provisioningError: message.slice(0, 1000),
      },
    }),
    prisma.promoCodeRedemption.updateMany({
      where: { paymentId },
      data: { status: 'CANCELED' },
    }),
  ])
}

async function provisionPromoPayment(
  payment: Payment,
  user: { id: string; email: string },
  plan: {
    id: string
    name: string
    durationDays: number
    trafficLimitGb: number | null
    deviceLimit: number
    activeInternalSquads: string[]
  }
) {
  try {
    await provisionPaymentSubscription({
      userId: user.id,
      email: user.email,
      paymentId: payment.id,
      plan: {
        id: plan.id,
        name: plan.name,
        durationDays: plan.durationDays,
        trafficLimitGb: plan.trafficLimitGb,
        deviceLimit: plan.deviceLimit,
        activeInternalSquads: plan.activeInternalSquads,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'subscription provisioning failed'
    await prisma.payment.update({
      where: { id: payment.id },
      data: { provisioningError: message.slice(0, 1000) },
    })
    logError('payment.create.promo_provisioning_failed', e, { paymentId: payment.id })
    return NextResponse.json({
      redirectUrl: `/dashboard/billing?paid=1&payment=${payment.id}`,
      localPaymentId: payment.id,
      provisioned: false,
    }, { status: 202 })
  }

  return NextResponse.json({
    redirectUrl: `/dashboard/subscription?activated=1`,
    localPaymentId: payment.id,
    provisioned: true,
  })
}
