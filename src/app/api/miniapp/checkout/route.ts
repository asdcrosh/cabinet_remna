import { requireAuth, withAuth } from '@/lib/auth/guard'
import { jsonResponse } from '@/lib/json-response'
import { requireMiniApp } from '@/lib/miniapp/config'
import { starsEnabled } from '@/lib/miniapp/stars'
import { createPaymentForUser } from '@/lib/payment-checkout'
import { rateLimit } from '@/lib/rate-limit'
import { withDistributedLock } from '@/lib/distributed-lock'

export const runtime = 'nodejs'

// В Mini App доступны Stars (инвойс Telegram) и карта/СБП через ЮKassa (страница оплаты в вебвью).
export const POST = withAuth(async (req: Request) => {
  requireMiniApp()
  const session = await requireAuth()
  const limited = await rateLimit(req, `miniapp-checkout:${session.uid}`, 10, 60_000)
  if (!limited.ok) return jsonResponse({ error: 'Слишком много попыток оплаты' }, { status: 429 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Неверный способ оплаты' }, { status: 400 })
  }
  const provider = Reflect.get(body, 'provider')
  if (provider !== 'TELEGRAM_STARS' && provider !== 'YOOKASSA') {
    return jsonResponse({ error: 'Неверный способ оплаты' }, { status: 400 })
  }
  if (provider === 'TELEGRAM_STARS' && !starsEnabled()) {
    return jsonResponse({ error: 'Оплата Stars сейчас недоступна' }, { status: 404 })
  }
  if (Reflect.get(body, 'purchaseType') !== 'SUBSCRIPTION') {
    return jsonResponse({ error: 'Неверный способ оплаты' }, { status: 400 })
  }
  const checkoutRequest = new Request(req.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const locked = await withDistributedLock(`billing-operation:${session.uid}`,
    () => createPaymentForUser(checkoutRequest, session.uid, { telegramBot: true }), { timeoutMs: 30_000 })
  if (!locked.acquired) return jsonResponse({ error: 'Другая операция оплаты уже выполняется' }, { status: 409 })
  return locked.value
})
