import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPaymentSchema } from '@/lib/auth/validation'

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(), offer: vi.fn(), squads: vi.fn(), checkout: vi.fn(), lock: vi.fn(), rate: vi.fn(), sync: vi.fn(),
  payment: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn() },
}))
vi.mock('@/lib/bot-whitelist', () => ({
  resolveBotUser: mocks.resolve, getBotWhitelistOffer: mocks.offer, syncBotWhitelistSquads: mocks.squads,
  BotWhitelistError: class extends Error { constructor(message: string, public status = 409) { super(message) } },
}))
vi.mock('@/lib/payment-checkout', () => ({ createPaymentForUser: mocks.checkout }))
vi.mock('@/lib/distributed-lock', () => ({ withDistributedLock: mocks.lock }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rate }))
vi.mock('@/lib/prisma', () => ({ prisma: { payment: mocks.payment } }))
vi.mock('@/lib/payment-sync', () => ({ syncPaymentProvisioning: mocks.sync }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))
import { POST } from './route'

const secret = 'test-only-shared-secret-32-characters'
const checkout = { action: 'checkout', sourceUserId: 7, telegramId: '123', provider: 'YOOKASSA', priceKopecks: 24900, planId: 'plan', idempotencyKey: '2a2c33d6-b091-4f73-8b9a-ecf62156efb3' }
function request(data: object, signed = true) {
  const body = JSON.stringify(data)
  const timestamp = String(Math.floor(Date.now() / 1000))
  return new Request('https://cabinet.test/api/bot/whitelist', { method: 'POST', body, headers: {
    'x-bot-timestamp': timestamp,
    'x-bot-signature': signed ? createHmac('sha256', secret).update(`${timestamp}\nPOST\n/api/bot/whitelist\n${body}`).digest('hex') : '',
  } })
}
afterEach(() => vi.unstubAllEnvs())
describe('authenticated bot checkout transport', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('REMNASHOP_BOT_API_SECRET', secret)
    vi.stubEnv('TELEGRAM_BOT_USERNAME', 'test_bot')
    mocks.resolve.mockResolvedValue({ id: 'local-user' })
    mocks.offer.mockResolvedValue({ available: true, planId: 'plan', priceKopecks: 24900 })
    mocks.rate.mockResolvedValue({ ok: true })
    mocks.lock.mockImplementation(async (_key, task) => ({ acquired: true, value: await task() }))
    mocks.payment.findFirst.mockResolvedValue(null)
    mocks.checkout.mockImplementation(async (req) => {
      expect(createPaymentSchema.safeParse(await req.json()).success).toBe(true)
      return Response.json({ localPaymentId: 'p1', confirmationUrl: 'https://pay.test' })
    })
  })
  it('rejects unsigned requests before looking up users or payments', async () => {
    expect((await POST(request(checkout, false))).status).toBe(401)
    expect(mocks.resolve).not.toHaveBeenCalled()
  })
  it('creates a whitelist-only checkout via the shared engine without email or browser cookies', async () => {
    expect((await POST(request(checkout))).status).toBe(200)
    expect(mocks.lock).toHaveBeenCalledWith('billing-operation:local-user', expect.any(Function), expect.any(Object))
    expect(mocks.checkout).toHaveBeenCalledWith(expect.any(Request), 'local-user', { telegramBot: true, returnUrl: 'https://t.me/test_bot?start=whitelist' })
  })
  it('rejects a stale quote and unavailable entitlement before charging', async () => {
    expect((await POST(request({ ...checkout, priceKopecks: 100 }))).status).toBe(409)
    mocks.offer.mockResolvedValue({ available: false, reason: 'Уже подключено' })
    expect((await POST(request(checkout))).status).toBe(409)
    expect(mocks.checkout).not.toHaveBeenCalled()
  })
  it('reuses the same invoice on a timeout retry even after payment has succeeded', async () => {
    mocks.payment.findFirst.mockResolvedValue({ id: 'p1', status: 'SUCCEEDED', amountKopecks: 24900 })
    const response = await POST(request(checkout))
    expect(await response.json()).toMatchObject({ localPaymentId: 'p1', status: 'SUCCEEDED', confirmationUrl: null })
    expect(mocks.checkout).not.toHaveBeenCalled()
    expect(mocks.offer).not.toHaveBeenCalled()
  })
  it('cannot check or grant another users payment', async () => {
    expect((await POST(request({ ...checkout, action: 'payment', paymentId: 'foreign' }))).status).toBe(404)
    expect(mocks.payment.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', userId: 'local-user', purchaseType: 'WHITELIST_ADDON' } })
    expect(mocks.sync).not.toHaveBeenCalled()
  })
  it('reports a saved paused entitlement as fulfilled and rejects an email-only provider', async () => {
    mocks.payment.findFirst.mockResolvedValue({ id: 'p1' })
    mocks.payment.findUniqueOrThrow.mockResolvedValue({ status: 'SUCCEEDED', subscriptionProvisionedAt: new Date(), subscription: { whitelistAddonActive: false, whitelistAddonRemainingSeconds: 86400n } })
    expect(await (await POST(request({ ...checkout, action: 'payment', paymentId: 'p1' }))).json()).toMatchObject({ provisioned: true, paused: true })
    expect((await POST(request({ ...checkout, provider: 'PAYANYWAY' }))).status).toBe(400)
  })
})
