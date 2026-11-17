import { requireAuth, withAuth } from '@/lib/auth/guard'
import { jsonResponse } from '@/lib/json-response'
import { requireMiniApp } from '@/lib/miniapp/config'
import { getMiniAppOverview } from '@/lib/miniapp/overview'
import { telegramRubleMethods, verifyBotCheckoutGrant } from '@/lib/miniapp/ruble-payments'
import { isYookassaConfigured } from '@/lib/yookassa'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const GET = withAuth(async (req: Request) => {
  requireMiniApp()
  const session = await requireAuth()
  const limit = await rateLimit(req, `miniapp-overview:${session.uid}`, 30, 60_000)
  if (!limit.ok) return jsonResponse({ error: 'Слишком много запросов' }, { status: 429 })
  const { searchParams } = new URL(req.url)
  const grant = searchParams.get('botCheckout')
  const planId = searchParams.get('plan')
  const botMethods = session.telegramMiniApp && grant && planId && verifyBotCheckoutGrant(grant, session.uid, planId)
    ? telegramRubleMethods('bot') : []
  const miniAppMethods = session.telegramMiniApp ? telegramRubleMethods('miniapp') : []
  const [overview, providerAvailable] = await Promise.all([
    getMiniAppOverview(session.uid),
    (miniAppMethods.length || botMethods.length) ? isYookassaConfigured() : false,
  ])
  return jsonResponse({
    ...overview,
    rublePaymentMethods: providerAvailable ? miniAppMethods : [],
    ...(providerAvailable && botMethods.length && planId ? { botCheckout: { planId, methods: botMethods } } : {}),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})
