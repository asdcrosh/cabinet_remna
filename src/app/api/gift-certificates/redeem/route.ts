import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { normalizePromoCode } from '@/lib/promo-codes'
import { provisionPaymentSubscription } from '@/lib/provisioning'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  code: z.string().trim().min(3).max(64),
})

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `gift-certificate:${session.uid}`, 10, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Введите код сертификата' }, { status: 400 })
  }

  const code = normalizePromoCode(parsed.data.code)
  if (!code) return NextResponse.json({ error: 'Введите код сертификата' }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })

  const now = new Date()
  const certificate = await prisma.giftCertificate.findUnique({
    where: { code },
    include: {
      plan: true,
      redemptions: {
        where: { status: 'SUCCEEDED' },
        select: { userId: true },
      },
    },
  })

  if (!certificate) return NextResponse.json({ error: 'Сертификат не найден' }, { status: 404 })
  if (!certificate.isActive) return NextResponse.json({ error: 'Сертификат отключён' }, { status: 400 })
  if (certificate.startsAt && certificate.startsAt > now) {
    return NextResponse.json({ error: 'Сертификат ещё не активен' }, { status: 400 })
  }
  if (certificate.expiresAt && certificate.expiresAt < now) {
    return NextResponse.json({ error: 'Срок действия сертификата истёк' }, { status: 400 })
  }
  if (!certificate.plan.isActive) {
    return NextResponse.json({ error: 'Тариф сертификата отключён' }, { status: 400 })
  }
  if (certificate.redemptions.length >= certificate.maxUses) {
    return NextResponse.json({ error: 'Лимит сертификата исчерпан' }, { status: 409 })
  }
  const userUses = certificate.redemptions.filter((item) => item.userId === user.id).length
  if (userUses >= certificate.maxUsesPerUser) {
    return NextResponse.json({ error: 'Вы уже использовали этот сертификат' }, { status: 409 })
  }

  let paymentId: string
  try {
    const payment = await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.giftCertificate.findUnique({
          where: { id: certificate.id },
          include: {
            redemptions: { where: { status: 'SUCCEEDED' }, select: { userId: true } },
          },
        })
        if (!fresh) throw new Error('CERTIFICATE_NOT_FOUND')
        if (fresh.redemptions.length >= fresh.maxUses) throw new Error('CERTIFICATE_LIMIT_REACHED')
        if (fresh.redemptions.filter((item) => item.userId === user.id).length >= fresh.maxUsesPerUser) {
          throw new Error('CERTIFICATE_USER_LIMIT_REACHED')
        }

        const createdPayment = await tx.payment.create({
          data: {
            userId: user.id,
            planId: certificate.planId,
            amountKopecks: 0,
            originalAmountKopecks: certificate.plan.priceKopecks,
            discountKopecks: certificate.plan.priceKopecks,
            status: 'SUCCEEDED',
            paidAt: now,
            promoCodeSnapshot: {
              type: 'gift_certificate',
              code: certificate.code,
              durationDays: certificate.durationDays,
            },
          },
        })

        await tx.giftCertificateRedemption.create({
          data: {
            giftCertificateId: certificate.id,
            userId: user.id,
            paymentId: createdPayment.id,
            codeSnapshot: certificate.code,
            durationDays: certificate.durationDays,
          },
        })

        return createdPayment
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
    paymentId = payment.id
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'CERTIFICATE_LIMIT_REACHED') {
      return NextResponse.json({ error: 'Лимит сертификата исчерпан' }, { status: 409 })
    }
    if (message === 'CERTIFICATE_USER_LIMIT_REACHED') {
      return NextResponse.json({ error: 'Вы уже использовали этот сертификат' }, { status: 409 })
    }
    throw error
  }

  try {
    await provisionPaymentSubscription({
      userId: user.id,
      email: user.email,
      paymentId,
      periodMode: 'EXTEND',
      plan: {
        id: certificate.plan.id,
        name: certificate.plan.name,
        durationDays: certificate.durationDays,
        trafficLimitGb: certificate.plan.trafficLimitGb,
        deviceLimit: certificate.plan.deviceLimit,
        activeInternalSquads: certificate.plan.activeInternalSquads,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'certificate provisioning failed'
    await prisma.payment.update({
      where: { id: paymentId },
      data: { provisioningError: message.slice(0, 1000) },
    })
    console.error('[gift-certificate/redeem] provisioning failed', error)
    return NextResponse.json({ ok: true, provisioned: false, paymentId }, { status: 202 })
  }

  return NextResponse.json({ ok: true, provisioned: true, paymentId })
})
