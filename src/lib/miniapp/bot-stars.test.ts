import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  botCall: vi.fn(), findUser: vi.fn(), catalog: vi.fn(), limitKey: vi.fn(),
  lock: vi.fn(), checkout: vi.fn(),
}))

vi.mock('./bot-api', () => ({ miniAppBotCall: mocks.botCall }))
vi.mock('./config', () => ({ miniAppUrl: () => 'https://cabinet.example.test/miniapp' }))
vi.mock('./stars', () => ({ starsEnabled: () => true }))
vi.mock('./stars-payments', () => ({ answerStarsPreCheckout: vi.fn(), isOurStarsPayload: vi.fn(),
  refundStarsPayment: vi.fn(), settleStarsPayment: vi.fn() }))
vi.mock('./bot-screens', () => ({ getBotScreen: vi.fn() }))
vi.mock('./rich-screens', () => ({ botScreens: [] }))
vi.mock('./channel-referrals', () => ({ claimChannelReward: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.findUser } } }))
vi.mock('@/lib/plan-catalog', () => ({ buildPlanCatalog: mocks.catalog }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitKey: mocks.limitKey }))
vi.mock('@/lib/distributed-lock', () => ({ withDistributedLock: mocks.lock }))
vi.mock('@/lib/payment-checkout', () => ({ createPaymentForUser: mocks.checkout }))

import { handleMiniAppUpdate } from './bot'

describe('Telegram bot Stars checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.botCall.mockResolvedValue(true)
    mocks.findUser.mockResolvedValue({ id: 'account-1' })
    mocks.catalog.mockResolvedValue({ plans: [{ id: 'plan-1', name: 'Стандарт 7 дн.',
      initialDeviceLimit: 1, durationDays: 7, unlimitedDuration: false }] })
    mocks.limitKey.mockResolvedValue({ ok: true })
    mocks.lock.mockImplementation(async (_key: string, task: () => Promise<Response>) => ({ acquired: true, value: await task() }))
    mocks.checkout.mockResolvedValue(Response.json({ confirmationUrl: 'https://t.me/$invoice',
      localPaymentId: 'ck12345678901234567890', starsAmount: 44 }))
  })

  it('creates an invoice without requiring an IP address on the internal bot request', async () => {
    await handleMiniAppUpdate({ update_id: 1, callback_query: { id: 'callback-1', from: { id: 123 },
      data: 'avp:buy:plan-1', message: { message_id: 1, chat: { id: 123, type: 'private' } } } })

    expect(mocks.limitKey).toHaveBeenCalledWith(expect.stringMatching(/^bot-stars:[0-9a-f]{64}$/), 10, 60_000)
    expect(mocks.limitKey.mock.calls[0]?.[0]).not.toContain('123')
    expect(mocks.checkout).toHaveBeenCalledWith(expect.any(Request), 'account-1', { telegramBot: true })
    expect(mocks.botCall).toHaveBeenCalledWith('sendInvoice', expect.objectContaining({
      chat_id: 123, currency: 'XTR', prices: [{ label: 'Стандарт 7 дн.', amount: 44 }],
    }))
  })
})
