// POST /api/payment/create — создаёт платёж в ЮKassa и возвращает URL для редиректа.
// Вызывается из UI страницы /plans.

import { NextResponse } from 'next/server'
import { Prisma, type Payment } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { createPaymentSchema } from '@/lib/auth/validation'
import { createPayment } from '@/lib/yookassa'
import { PromoCodeError, validatePromoCodeForPlan } from '@/lib/promo-codes'
import { getAppUrl } from '@/lib/app-url'
import { rateLimit } from '@/lib/rate-limit'
import { provisionPaymentSubscription } from '@/lib/provisioning'

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
  const { planId, promoCode } = parsed.data

  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: 'Тариф не найден' }, { status: 404 })
  }
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (plan.isPromo) {
    if (promoCode) {
      return NextResponse.json({ error: 'Промокод не нужен для этого тарифа' }, { status: 400 })
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

  let payment
  try {
    payment = await createPayment({
      amount: amountRub,
      description: appliedPromo
        ? `Подписка: ${plan.name} (${plan.durationDays} дн.), промокод ${appliedPromo.normalizedCode}`
        : `Подписка: ${plan.name} (${plan.durationDays} дн.)`,
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
    await prisma.payment.update({
      where: { id: localPayment.id },
      data: {
        status: 'CANCELED',
        provisioningError: message.slice(0, 1000),
      },
    })
    await prisma.promoCodeRedemption.updateMany({
      where: { paymentId: localPayment.id },
      data: { status: 'CANCELED' },
    })
    console.error('[payment/create] YooKassa createPayment failed', e)
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
      confirmationUrl: payment.confirmation?.confirmation_url ?? null,
    },
  })

  return NextResponse.json({
    confirmationUrl: payment.confirmation?.confirmation_url,
    paymentId: payment.id,
    localPaymentId: localPayment.id,
  })
})

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
    console.error('[payment/create] promo provisioning failed', e)
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
