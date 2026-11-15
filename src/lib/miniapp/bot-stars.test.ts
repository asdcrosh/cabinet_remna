import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  botCall: vi.fn(), findUser: vi.fn(), catalog: vi.fn(), limitKey: vi.fn(),
  lock: vi.fn(), checkout: vi.fn(), paymentScreen: vi.fn(),
  settle: vi.fn(), refund: vi.fn(), getBotScreen: vi.fn(),
  findPayment: vi.fn(), updatePayment: vi.fn(),
  findFirstUser: vi.fn(), updateManyUser: vi.fn(),
}))

vi.mock('./bot-api', () => ({ miniAppBotCall: mocks.botCall }))
vi.mock('./config', () => ({ miniAppUrl: () => 'https://cabinet.example.test/miniapp' }))
vi.mock('./stars', () => ({ starsEnabled: () => true }))
vi.mock('./stars-payments', () => ({ answerStarsPreCheckout: vi.fn(), isOurStarsPayload: vi.fn(),
  refundStarsPayment: mocks.refund, settleStarsPayment: mocks.settle }))
vi.mock('./bot-screens', () => ({ getBotScreen: mocks.getBotScreen, getBotPaymentScreen: mocks.paymentScreen }))
vi.mock('./rich-screens', () => ({ botScreens: [],
  buildStarsInvoiceScreen: vi.fn(() => '<h3>⭐ Счёт на оплату</h3>') }))
vi.mock('./channel-referrals', () => ({ claimChannelReward: vi.fn(), channelGate: vi.fn(async () => null) }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: mocks.findUser, findFirst: mocks.findFirstUser, updateMany: mocks.updateManyUser },
  payment: { findUnique: mocks.findPayment, update: mocks.updatePayment },
} }))
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
    mocks.paymentScreen.mockResolvedValue('<h3>Выберите способ оплаты</h3>')
    mocks.findPayment.mockResolvedValue(null)
    mocks.updatePayment.mockResolvedValue({})
    mocks.findFirstUser.mockResolvedValue(null)
    mocks.updateManyUser.mockResolvedValue({ count: 1 })
    mocks.settle.mockResolvedValue({ alreadySettled: false })
    mocks.refund.mockResolvedValue({})
    mocks.getBotScreen.mockResolvedValue('<h3>💎 Тарифы</h3>')
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

  it('opens the payment method screen without creating a charge', async () => {
    await handleMiniAppUpdate({ update_id: 2, callback_query: { id: 'callback-2', from: { id: 123 },
      data: 'avp:pay:plan-1', message: { message_id: 2, chat: { id: 123, type: 'private' } } } })

    expect(mocks.paymentScreen).toHaveBeenCalledWith(123, 'plan-1')
    expect(mocks.botCall).toHaveBeenCalledWith('editMessageText', expect.objectContaining({
      chat_id: 123, message_id: 2, rich_message: { html: '<h3>Выберите способ оплаты</h3>' },
    }))
    expect(mocks.checkout).not.toHaveBeenCalled()
  })

  it('successful stars payment removes the invoice and refreshes the single window', async () => {
    process.env.TELEGRAM_RICH_MESSAGES_ENABLED = 'true'
    mocks.settle.mockResolvedValue({ alreadySettled: false })
    mocks.findPayment.mockResolvedValue({ botInvoiceMessageId: 555 })
    mocks.updatePayment.mockResolvedValue({})
    mocks.getBotScreen.mockResolvedValue('<h3>📡 Моя подписка</h3>')
    mocks.botCall.mockImplementation(async (method: string) =>
      method === 'sendRichMessage' ? { message_id: 901 } : true)

    await handleMiniAppUpdate({ update_id: 3, message: { message_id: 600, from: { id: 123 },
      chat: { id: 123, type: 'private' },
      successful_payment: { currency: 'XTR', total_amount: 44, invoice_payload: 'avp:ck12345678901234567890',
        telegram_payment_charge_id: 'charge-1' } } })

    expect(mocks.settle).toHaveBeenCalledWith(123, expect.objectContaining({ telegram_payment_charge_id: 'charge-1' }))
    // Счёт и сервисное сообщение удалены, окно обновлено свежим экраном подписки.
    expect(mocks.botCall).toHaveBeenCalledWith('deleteMessage', { chat_id: 123, message_id: 555 })
    expect(mocks.botCall).toHaveBeenCalledWith('deleteMessage', { chat_id: 123, message_id: 600 })
    const send = mocks.botCall.mock.calls.find(([method]) => method === 'sendRichMessage')
    expect(send?.[1]?.rich_message?.html).toBe('<h3>📡 Моя подписка</h3>')
    expect(mocks.updatePayment).toHaveBeenCalledWith({ where: { id: 'ck12345678901234567890' },
      data: { botInvoiceMessageId: null } })
    delete process.env.TELEGRAM_RICH_MESSAGES_ENABLED
  })

  it('invoice screen is shown in the single window before sending the invoice', async () => {
    process.env.TELEGRAM_RICH_MESSAGES_ENABLED = 'true'
    mocks.getBotScreen.mockResolvedValue('<h3>💎 Тарифы</h3>')
    mocks.botCall.mockImplementation(async (method: string) =>
      method === 'sendRichMessage' ? { message_id: 901 } : method === 'sendInvoice' ? { message_id: 777 } : true)
    mocks.findFirstUser.mockResolvedValue(null)
    mocks.updateManyUser.mockResolvedValue({ count: 1 })

    await handleMiniAppUpdate({ update_id: 4, callback_query: { id: 'callback-4', from: { id: 123 },
      data: 'avp:buy:plan-1', message: { message_id: 40, chat: { id: 123, type: 'private' } } } })

    expect(mocks.botCall).toHaveBeenCalledWith('sendRichMessage', expect.objectContaining({
      chat_id: 123, rich_message: { html: '<h3>⭐ Счёт на оплату</h3>' } }))
    expect(mocks.botCall).toHaveBeenCalledWith('sendInvoice', expect.objectContaining({ chat_id: 123, currency: 'XTR' }))
    expect(mocks.updatePayment).toHaveBeenCalledWith({ where: { id: 'ck12345678901234567890' },
      data: { botInvoiceMessageId: 777 } })
    delete process.env.TELEGRAM_RICH_MESSAGES_ENABLED
  })
})
