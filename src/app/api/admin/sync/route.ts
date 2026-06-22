import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { provisionPaymentSubscription } from '@/lib/provisioning'

export const runtime = 'nodejs'

export const POST = withAuth(async (req: Request) => {
  await requireAdmin()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const paymentId =
    body && typeof body === 'object' && 'paymentId' in body && typeof body.paymentId === 'string'
      ? body.paymentId
      : null

  if (!paymentId) {
    return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: true, plan: true },
  })

  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  if (payment.status !== 'SUCCEEDED') {
    return NextResponse.json({ error: 'Payment is not succeeded' }, { status: 409 })
  }
  if (payment.subscriptionProvisionedAt) {
    return NextResponse.json({ ok: true, alreadyProvisioned: true })
  }

  const result = await provisionPaymentSubscription({
    userId: payment.user.id,
    email: payment.user.email,
    paymentId: payment.id,
    plan: {
      id: payment.plan.id,
      name: payment.plan.name,
      durationDays: payment.plan.durationDays,
      trafficLimitGb: payment.plan.trafficLimitGb,
      deviceLimit: payment.plan.deviceLimit,
      activeInternalSquads: payment.plan.activeInternalSquads,
    },
  })

  return NextResponse.json({ ok: true, subscriptionId: result.subscription.id })
})
