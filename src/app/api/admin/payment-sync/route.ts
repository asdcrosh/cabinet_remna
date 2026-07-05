import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { getPendingPaymentTtlMs, syncPaymentProvisioning } from '@/lib/payment-sync'
import { writeAuditLog } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  if (!paymentId) {
    return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })
  }

  const result = await syncPaymentProvisioning({
    paymentId,
    cancelPendingOlderThanMs: getPendingPaymentTtlMs(),
  })
  await writeAuditLog({
    actorId: session.uid,
    targetId: result.status === 'not_found' ? null : paymentId,
    action: 'PAYMENT_SYNCED',
    message: 'Администратор вручную проверил платёж',
    metadata: {
      paymentId,
      status: result.status,
      ok: 'ok' in result ? result.ok : undefined,
      provisioned: 'provisioned' in result ? result.provisioned : undefined,
    },
    request: req,
  })

  if (result.status === 'not_found') return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  if (result.status === 'missing_external_id') {
    return NextResponse.json({ error: 'У платежа нет ID ЮKassa для проверки' }, { status: 409 })
  }

  if (result.status === 'canceled') {
    return NextResponse.json({ ok: true, paymentStatus: 'CANCELED', provisioned: false })
  }

  if (result.status === 'pending') {
    return NextResponse.json({
      ok: true,
      paymentStatus: 'PENDING',
      provisioned: false,
    })
  }

  if (result.ok && result.provisioned) {
    return NextResponse.json({
      ok: true,
      paymentStatus: 'SUCCEEDED',
      provisioned: true,
      alreadyProvisioned: result.alreadyProvisioned,
      subscriptionId: result.subscriptionId,
    })
  }

  return NextResponse.json(
    {
      error: result.ok ? 'Не удалось проверить платёж' : result.error,
      paymentStatus: result.status === 'provisioning_failed' ? 'SUCCEEDED' : 'PENDING',
      provisioned: false,
    },
    { status: 500 }
  )
})
