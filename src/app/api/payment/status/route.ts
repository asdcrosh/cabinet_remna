import { NextResponse } from 'next/server'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { getPendingPaymentTtlMs, syncPaymentProvisioning } from '@/lib/payment-sync'
import { getPaymentBannerStatus } from '@/lib/payment-status-presentation'
import { readPaymentBannerStatus } from '@/lib/payment-status-read'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function paymentIdFromRequest(req: Request, body?: unknown) {
  if (body && typeof body === 'object' && 'paymentId' in body && typeof body.paymentId === 'string') {
    return body.paymentId
  }
  return new URL(req.url).searchParams.get('paymentId')
}

export const GET = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const paymentId = paymentIdFromRequest(req)
  if (!paymentId) return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })

  const limited = await rateLimit(req, `payment-status-read:${session.uid}:${paymentId}`, 60, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Статус проверяется слишком часто. Подождите немного.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  return NextResponse.json({ status: await readPaymentBannerStatus(paymentId, session.uid) })
})

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const body = await req.json().catch(() => null)
  const paymentId = paymentIdFromRequest(req, body)
  if (!paymentId) return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })

  const limited = await rateLimit(req, `payment-status-reconcile:${session.uid}:${paymentId}`, 3, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Повторная проверка уже запущена. Подождите немного.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const result = await syncPaymentProvisioning({
    paymentId,
    userId: session.uid,
    cancelPendingOlderThanMs: getPendingPaymentTtlMs(),
  })
  return NextResponse.json({ status: getPaymentBannerStatus(result) })
})
