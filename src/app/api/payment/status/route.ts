import { NextResponse } from 'next/server'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { getPendingPaymentTtlMs, syncPaymentProvisioning } from '@/lib/payment-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const body = await req.json().catch(() => null)
  const paymentId = body && typeof body === 'object' && 'paymentId' in body && typeof body.paymentId === 'string'
    ? body.paymentId
    : null
  if (!paymentId) return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })

  const result = await syncPaymentProvisioning({
    paymentId,
    userId: session.uid,
    cancelPendingOlderThanMs: getPendingPaymentTtlMs(),
  })
  const status = result.status === 'not_found'
    ? 'not_found'
    : result.status === 'canceled'
      ? 'canceled'
      : result.status === 'pending' || result.status === 'missing_external_id'
        ? 'awaiting'
      : result.status === 'succeeded' && result.provisioned
        ? 'ready'
        : !result.ok
          ? 'attention'
          : 'processing'
  return NextResponse.json({ status })
})
