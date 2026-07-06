import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { provisionPaymentSubscription } from '@/lib/provisioning'
import { writeAuditLog } from '@/lib/audit-log'

export const runtime = 'nodejs'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAdmin()

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
  const paymentIds =
    body && typeof body === 'object' && 'paymentIds' in body && Array.isArray(body.paymentIds)
      ? body.paymentIds.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 100)
      : []

  if (!paymentId && paymentIds.length === 0) {
    return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })
  }

  if (paymentIds.length > 0) {
    const results = []
    for (const id of paymentIds) {
      results.push(await provisionOnePayment(req, session.uid, id))
    }
    return NextResponse.json({
      ok: true,
      total: results.length,
      provisioned: results.filter((item) => item.status === 'provisioned').length,
      alreadyProvisioned: results.filter((item) => item.status === 'already_provisioned').length,
      failed: results.filter((item) => item.status === 'failed').length,
      results,
    })
  }

  const result = await provisionOnePayment(req, session.uid, paymentId!)
  if (result.status === 'not_found') return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  if (result.status === 'not_succeeded') return NextResponse.json({ error: 'Payment is not succeeded' }, { status: 409 })
  if (result.status === 'already_provisioned') return NextResponse.json({ ok: true, alreadyProvisioned: true })
  if (result.status === 'failed') return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, subscriptionId: result.subscriptionId })
})

async function provisionOnePayment(req: Request, actorId: string, paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: true, plan: true },
  })

  if (!payment) return { paymentId, status: 'not_found' as const }
  if (payment.status !== 'SUCCEEDED') {
    return { paymentId, status: 'not_succeeded' as const }
  }
  if (payment.subscriptionProvisionedAt) {
    return { paymentId, status: 'already_provisioned' as const }
  }

  try {
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
    await writeAuditLog({
      actorId,
      targetId: payment.user.id,
      action: 'PAYMENT_SYNCED',
      message: 'Администратор вручную выдал подписку по платежу',
      metadata: {
        paymentId: payment.id,
        subscriptionId: result.subscription.id,
        planId: payment.plan.id,
        planName: payment.plan.name,
      },
      request: req,
    })

    return { paymentId, status: 'provisioned' as const, subscriptionId: result.subscription.id }
  } catch (error) {
    return { paymentId, status: 'failed' as const, error: error instanceof Error ? error.message : 'Provisioning failed' }
  }
}
