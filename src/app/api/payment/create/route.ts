import { jsonResponse } from '@/lib/json-response'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import { withDistributedLock } from '@/lib/distributed-lock'
import { createPaymentForUser } from '@/lib/payment-checkout'
import { isMobileSession, isTelegramMiniAppSession } from '@/lib/auth/jwt'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  if (isTelegramMiniAppSession(session)) {
    const body = await req.clone().json().catch(() => null)
    const plan = body && typeof body.planId === 'string'
      ? await prisma.plan.findUnique({ where: { id: body.planId }, select: { isPromo: true, priceKopecks: true } })
      : null
    if (!plan?.isPromo || plan.priceKopecks > 0 || (body.purchaseType && body.purchaseType !== 'SUBSCRIPTION')) {
      return jsonResponse({ error: 'Оплата VPN внутри Telegram будет доступна после подключения Stars.' }, { status: 403 })
    }
  }
  const limited = await rateLimit(req, `payment-create:${session.uid}`, 10, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много попыток оплаты. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const locked = await withDistributedLock(
    `billing-operation:${session.uid}`,
    () => createPaymentForUser(req, session.uid, { mobileApp: isMobileSession(session) }),
    { timeoutMs: 30_000 }
  )
  if (!locked.acquired) {
    return jsonResponse(
      { error: 'Другая операция оплаты уже выполняется. Дождитесь её завершения и повторите.' },
      { status: 409 }
    )
  }
  return locked.value
})
