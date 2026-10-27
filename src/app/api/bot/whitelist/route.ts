import { jsonResponse } from '@/lib/json-response'
import { z } from 'zod'
import { verifyBotRequest } from '@/lib/bot-api-auth'
import { BotWhitelistError, getBotWhitelistOffer, resolveBotUser, syncBotWhitelistSquads } from '@/lib/bot-whitelist'
import { withDistributedLock } from '@/lib/distributed-lock'
import { createPaymentForUser } from '@/lib/payment-checkout'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { syncPaymentProvisioning } from '@/lib/payment-sync'
import { isWhitelistAddonPaused } from '@/lib/whitelist-addon-policy'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

const identity = {
  sourceUserId: z.number().int().positive().safe(),
  telegramId: z.string().regex(/^[1-9]\d{0,15}$/),
}
const schema = z.discriminatedUnion('action', [
  z.object({ ...identity, action: z.literal('offer') }),
  z.object({
    ...identity, action: z.literal('checkout'),
    provider: z.enum(['YOOKASSA', 'PLATEGA']), idempotencyKey: z.string().uuid(),
    priceKopecks: z.number().int().positive(), planId: z.string().min(1).max(128),
  }),
  z.object({ ...identity, action: z.literal('payment'), paymentId: z.string().min(1).max(128) }),
  z.object({
    ...identity, telegramId: identity.telegramId.optional(), action: z.literal('sync-squads'),
    remnawaveUuid: z.string().uuid(), expireAt: z.string().datetime({ offset: true }), active: z.boolean(),
    baseSquads: z.array(z.string().uuid()).max(100), planSquads: z.array(z.string().uuid()).max(100),
    previousBaseSquads: z.array(z.string().uuid()).max(100).optional(),
  }),
])

export async function POST(req: Request) {
  const raw = await req.text()
  if (raw.length > 16_384) return jsonResponse({ error: 'Request too large' }, { status: 413 })
  if (!verifyBotRequest(req, raw)) return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  let json: unknown
  try { json = JSON.parse(raw) } catch { return jsonResponse({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = schema.safeParse(json)
  if (!parsed.success) return jsonResponse({ error: 'Invalid request' }, { status: 400 })
  const input = parsed.data
  const limited = await rateLimit(req, `bot-whitelist:${input.sourceUserId}:${input.action}`, input.action === 'checkout' ? 10 : 60, 60_000)
  if (!limited.ok) return jsonResponse({ error: 'Слишком часто. Попробуйте через минуту.' }, { status: 429 })
  try {
    const user = await resolveBotUser(input.sourceUserId, input.telegramId, input.action === 'offer' || input.action === 'checkout')
    if (input.action === 'offer') return jsonResponse(await getBotWhitelistOffer(user), { headers: { 'Cache-Control': 'no-store' } })
    if (input.action === 'sync-squads') {
      const locked = await withDistributedLock(`payment-provisioning:${user.id}`, () => syncBotWhitelistSquads(user, input))
      if (!locked.acquired) throw new BotWhitelistError('Подписка обновляется. Повторите операцию.')
      return jsonResponse(locked.value)
    }
    if (input.action === 'payment') {
      const payment = await prisma.payment.findFirst({
        where: { id: input.paymentId, userId: user.id, purchaseType: 'WHITELIST_ADDON' },
      })
      if (!payment) throw new BotWhitelistError('Платёж не найден', 404)
      await syncPaymentProvisioning({ paymentId: payment.id, userId: user.id })
      const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { subscription: true } })
      return jsonResponse({
        status: updated.status, provisioned: Boolean(updated.subscriptionProvisionedAt),
        paused: Boolean(updated.subscription && isWhitelistAddonPaused(updated.subscription)),
        expireAt: updated.subscription?.whitelistAddonExpireAt?.toISOString() ?? null,
      })
    }
    const locked = await withDistributedLock(`billing-operation:${user.id}`, async () => {
      // Reuse an already created checkout after a timeout, even if entitlement is now active.
      const checkoutKey = input.idempotencyKey
      const previous = await prisma.payment.findFirst({ where: { userId: user.id, checkoutKey, purchaseType: 'WHITELIST_ADDON' } })
      if (previous && (previous.provider !== input.provider || previous.planId !== input.planId || previous.amountKopecks !== input.priceKopecks)) {
        throw new BotWhitelistError('Ключ оплаты уже использован для другого заказа. Откройте покупку заново.')
      }
      if (previous) return jsonResponse({
        localPaymentId: previous.id, confirmationUrl: previous.status === 'PENDING' ? previous.confirmationUrl : null,
        status: previous.status, amountKopecks: previous.amountKopecks, provider: previous.provider,
      })
      const offer = await getBotWhitelistOffer(user)
      if (!offer.available) throw new BotWhitelistError(offer.reason!)
      if (offer.planId !== input.planId || offer.priceKopecks !== input.priceKopecks) {
        throw new BotWhitelistError('Условия изменились. Откройте белые списки заново и проверьте цену.')
      }
      const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '')
      if (!username || !/^[A-Za-z0-9_]+$/.test(username)) throw new BotWhitelistError('Оплата в боте ещё не настроена.', 503)
      const response = await createPaymentForUser(new Request(req.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: offer.planId, purchaseType: 'WHITELIST_ADDON', provider: input.provider, idempotencyKey: checkoutKey }),
      }), user.id, { telegramBot: true, returnUrl: `https://t.me/${username}?start=whitelist` })
      if (!response.ok) return response
      const result = await response.json()
      const payment = await prisma.payment.findFirst({ where: { id: result.localPaymentId ?? result.paymentId, userId: user.id } })
      return jsonResponse({ ...result, amountKopecks: payment?.amountKopecks })
    }, { timeoutMs: 45_000 })
    if (!locked.acquired) throw new BotWhitelistError('Счёт уже создаётся. Подождите и повторите.')
    return locked.value
  } catch (error) {
    if (error instanceof BotWhitelistError) return jsonResponse({ error: error.message }, { status: error.status })
    logError('bot.whitelist.failed', error, { sourceUserId: input.sourceUserId, action: input.action })
    return jsonResponse({ error: 'Не удалось связаться с кабинетом. Попробуйте позже.' }, { status: 503 })
  }
}
