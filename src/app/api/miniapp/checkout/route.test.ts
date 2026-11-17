import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBotCheckoutGrant } from '@/lib/miniapp/ruble-payments'

const { createPaymentForUser, requireAuth } = vi.hoisted(() => ({
  createPaymentForUser: vi.fn(async () => Response.json({ ok: true })),
  requireAuth: vi.fn<() => Promise<{ uid: string; telegramMiniApp?: true }>>(),
}))
vi.mock('@/lib/auth/guard', () => ({
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
  requireAuth,
}))
vi.mock('@/lib/payment-checkout', () => ({ createPaymentForUser }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ ok: true }) }))
vi.mock('@/lib/distributed-lock', () => ({
  withDistributedLock: async (_key: string, handler: () => Promise<Response>) =>
    ({ acquired: true, value: await handler() }),
}))

import { POST } from './route'

function checkout(fields: Record<string, unknown> = {}) {
  return POST(new Request('https://cabinet.example.test/api/miniapp/checkout', {
    method: 'POST', body: JSON.stringify({
      planId: 'plan-one', purchaseType: 'SUBSCRIPTION', provider: 'YOOKASSA', ...fields,
    }),
  }))
}

describe('Telegram payment method switches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue({ uid: 'user-one', telegramMiniApp: true })
    vi.stubEnv('TELEGRAM_MINIAPP_ENABLED', 'true')
    vi.stubEnv('TELEGRAM_MINIAPP_WEBHOOK_SECRET', 'local-test-secret-32-characters-long')
    vi.stubEnv('TELEGRAM_MINIAPP_CARD_ENABLED', '')
    vi.stubEnv('TELEGRAM_MINIAPP_SBP_ENABLED', '')
    vi.stubEnv('TELEGRAM_BOT_CARD_ENABLED', '')
    vi.stubEnv('TELEGRAM_BOT_SBP_ENABLED', '')
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

  it('disables both ruble methods by default while preserving Stars', async () => {
    expect((await checkout({ paymentMethodType: 'bank_card' })).status).toBe(403)
    expect((await checkout({ paymentMethodType: 'sbp' })).status).toBe(403)
    expect(createPaymentForUser).not.toHaveBeenCalled()
    vi.stubEnv('TELEGRAM_STARS_ENABLED', 'true')
    expect((await checkout({ provider: 'TELEGRAM_STARS' })).status).toBe(200)
  })

  it('only enables the selected Mini App method and passes it to YooKassa checkout', async () => {
    vi.stubEnv('TELEGRAM_MINIAPP_CARD_ENABLED', 'true')
    expect((await checkout()).status).toBe(403)
    expect((await checkout({ paymentMethodType: 'sbp' })).status).toBe(403)
    requireAuth.mockResolvedValueOnce({ uid: 'user-one' })
    expect((await checkout({ paymentMethodType: 'bank_card' })).status).toBe(403)
    expect((await checkout({ paymentMethodType: 'bank_card' })).status).toBe(200)
    expect(createPaymentForUser).toHaveBeenCalledWith(
      expect.any(Request), 'user-one', { telegramBot: true, paymentMethodType: 'bank_card' },
    )
  })

  it('honors the bot switch only for a valid bot checkout tied to the user and plan', async () => {
    vi.useFakeTimers()
    vi.stubEnv('TELEGRAM_BOT_SBP_ENABLED', 'true')
    const grant = createBotCheckoutGrant('user-one', 'plan-one')
    expect(grant).toBeTruthy()
    const botPayment = { paymentMethodType: 'sbp', botCheckoutGrant: grant }
    expect((await checkout({ paymentMethodType: 'sbp' })).status).toBe(403)
    expect((await checkout({ ...botPayment, planId: 'plan-two' })).status).toBe(403)
    expect((await checkout({ ...botPayment, botCheckoutGrant: createBotCheckoutGrant('user-two', 'plan-one') })).status).toBe(403)
    expect((await checkout({ ...botPayment, paymentMethodType: 'bank_card' })).status).toBe(403)
    expect((await checkout(botPayment)).status).toBe(200)
    vi.advanceTimersByTime(16 * 60_000)
    expect((await checkout(botPayment)).status).toBe(403)
    expect(createPaymentForUser).toHaveBeenCalledTimes(1)
  })
})
