import { NextResponse } from 'next/server'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import { withDistributedLock } from '@/lib/distributed-lock'
import { createPaymentForUser } from '@/lib/payment-checkout'

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

  const locked = await withDistributedLock(
    `billing-operation:${session.uid}`,
    () => createPaymentForUser(req, session.uid),
    { timeoutMs: 30_000 }
  )
  if (!locked.acquired) {
    return NextResponse.json(
      { error: 'Другая операция оплаты уже выполняется. Дождитесь её завершения и повторите.' },
      { status: 409 }
    )
  }
  return locked.value
})
