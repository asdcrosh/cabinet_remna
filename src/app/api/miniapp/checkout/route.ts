import { requireAuth, withAuth } from '@/lib/auth/guard'
import { jsonResponse } from '@/lib/json-response'
import { requireMiniApp } from '@/lib/miniapp/config'
import { telegramRubleMethods, verifyBotCheckoutGrant } from '@/lib/miniapp/ruble-payments'
import { starsEnabled } from '@/lib/miniapp/stars'
import { createPaymentForUser } from '@/lib/payment-checkout'
import { rateLimit } from '@/lib/rate-limit'
import { withDistributedLock } from '@/lib/distributed-lock'

export const runtime = 'nodejs'

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
  let paymentMethodType: 'bank_card' | 'sbp' | undefined
  if (provider === 'YOOKASSA') {
    if (!session.telegramMiniApp) {
      return jsonResponse({ error: 'Откройте Mini App из Telegram.' }, { status: 403 })
    }
    const method = Reflect.get(body, 'paymentMethodType')
    const grant = Reflect.get(body, 'botCheckoutGrant')
    const planId = Reflect.get(body, 'planId')
    if (grant !== undefined && (typeof grant !== 'string' || typeof planId !== 'string'
      || !verifyBotCheckoutGrant(grant, session.uid, planId))) {
      return jsonResponse({ error: 'Ссылка на оплату устарела. Откройте тариф заново.' }, { status: 403 })
    }
    const methods = telegramRubleMethods(grant === undefined ? 'miniapp' : 'bot')
    if ((method !== 'bank_card' && method !== 'sbp') || !methods.includes(method)) {
      return jsonResponse({ error: 'Этот способ оплаты здесь недоступен. Откройте кабинет в браузере.' }, { status: 403 })
    }
    paymentMethodType = method
  }
  const checkoutRequest = new Request(req.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const locked = await withDistributedLock(`billing-operation:${session.uid}`,
    () => createPaymentForUser(checkoutRequest, session.uid, { telegramBot: true, paymentMethodType }), { timeoutMs: 30_000 })
  if (!locked.acquired) return jsonResponse({ error: 'Другая операция оплаты уже выполняется' }, { status: 409 })
  return locked.value
})
