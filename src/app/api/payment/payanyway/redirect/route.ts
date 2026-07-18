import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { getAppUrl } from '@/lib/app-url'
import { logInfo } from '@/lib/logger'
import { createPayAnyWayPaymentRequest } from '@/lib/payanyway'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const paymentIdSchema = z.string().trim().min(1).max(100)

export const GET = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const paymentId = paymentIdSchema.safeParse(new URL(req.url).searchParams.get('payment'))
  if (!paymentId.success) {
    return NextResponse.json({ error: 'Некорректный платёж' }, { status: 400 })
  }

  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId.data,
      userId: session.uid,
      provider: 'PAYANYWAY',
      status: 'PENDING',
    },
    include: { plan: { select: { name: true, durationDays: true } } },
  })
  if (!payment) {
    return NextResponse.json({ error: 'Платёж не найден или уже завершён' }, { status: 404 })
  }

  const baseUrl = getAppUrl()
  const request = await createPayAnyWayPaymentRequest({
    transactionId: payment.id,
    amountKopecks: payment.amountKopecks,
    description: `Подписка: ${payment.plan.name} (${payment.plan.durationDays} дн.)`,
    subscriberId: session.email,
    successUrl: `${baseUrl}/dashboard/billing?paid=1&payment=${payment.id}`,
    failUrl: `${baseUrl}/dashboard/billing?payment=${payment.id}&failed=1`,
    returnUrl: `${baseUrl}/dashboard/billing?payment=${payment.id}`,
  })

  logInfo('payment.payanyway.form_prepared', {
    paymentId: payment.id,
    merchantId: request.fields.MNT_ID,
    amount: request.fields.MNT_AMOUNT,
    subscriberType: 'email',
    testMode: request.fields.MNT_TEST_MODE,
    configSource: request.diagnostics.source,
    integrityLength: request.diagnostics.secretLength,
    integrityFingerprint: request.diagnostics.secretFingerprint,
    payloadFingerprint: request.diagnostics.payloadFingerprint,
  })

  const paymentUrl = new URL(request.action)
  for (const [name, value] of Object.entries(request.fields)) {
    paymentUrl.searchParams.set(name, value)
  }
  return NextResponse.redirect(paymentUrl, 302)
})
