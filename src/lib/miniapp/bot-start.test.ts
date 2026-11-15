import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  botCall: vi.fn(), findUser: vi.fn(), findFirstUser: vi.fn(), updateManyUser: vi.fn(), deleteDialogs: vi.fn(),
}))

vi.mock('./bot-api', () => ({ miniAppBotCall: mocks.botCall, downloadTelegramFile: vi.fn() }))
vi.mock('./config', () => ({ miniAppUrl: () => 'https://cabinet.example.test/miniapp' }))
vi.mock('./stars', () => ({ starsEnabled: () => false }))
vi.mock('./stars-payments', () => ({ answerStarsPreCheckout: vi.fn(), isOurStarsPayload: vi.fn(),
  refundStarsPayment: vi.fn(), settleStarsPayment: vi.fn() }))
vi.mock('./bot-screens', () => ({ getBotScreen: vi.fn(async () => '<h3>🏠 Главная</h3>'),
  getBotScreenInput: vi.fn(async () => ({ screen: 'home', overview: null, appUrl: 'https://cabinet.example.test/miniapp' })),
  getBotPaymentScreen: vi.fn(), getBotPlansPromoScreen: vi.fn(), getBotAdminThreadScreen: vi.fn(),
  getBotAdminTicketsScreen: vi.fn(), getBotBroadcastThemesScreen: vi.fn(), getBotSupportThreadScreen: vi.fn(),
  validateBotPromoCode: vi.fn() }))
vi.mock('./rich-screens', () => ({ botScreens: [], buildWhatsNewScreen: vi.fn(() => '<h3>Что нового</h3>') }))
vi.mock('./channel-referrals', () => ({ claimChannelReward: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: mocks.findUser, findFirst: mocks.findFirstUser, updateMany: mocks.updateManyUser },
  telegramBotDialog: { deleteMany: mocks.deleteDialogs },
} }))
vi.mock('@/lib/plan-catalog', () => ({ buildPlanCatalog: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitKey: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/distributed-lock', () => ({ withDistributedLock: vi.fn() }))
vi.mock('@/lib/payment-checkout', () => ({ createPaymentForUser: vi.fn() }))

import { handleMiniAppUpdate } from './bot'

describe('Telegram /start в едином окне', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TELEGRAM_RICH_MESSAGES_ENABLED = 'true'
    mocks.botCall.mockImplementation(async (method: string) => method === 'sendRichMessage' || method === 'sendMessage' ? { message_id: 901 } : true)
    mocks.findUser.mockResolvedValue({ id: 'account-1', role: 'USER' })
    mocks.findFirstUser.mockResolvedValue(null) // якоря ещё нет
    mocks.updateManyUser.mockResolvedValue({ count: 1 })
    mocks.deleteDialogs.mockResolvedValue({ count: 0 })
  })

  it('/start удаляет команду и показывает экран новым сообщением', async () => {
    await handleMiniAppUpdate({ update_id: 1, message: { message_id: 10, from: { id: 123 },
      chat: { id: 123, type: 'private' }, text: '/start' } })

    const methods = mocks.botCall.mock.calls.map(([method]) => method)
    expect(methods).toContain('deleteMessage')
    expect(methods).toContain('sendRichMessage')
    const send = mocks.botCall.mock.calls.find(([method]) => method === 'sendRichMessage')
    expect(send?.[1]).toEqual(expect.objectContaining({ chat_id: 123, rich_message: { html: '<h3>🏠 Главная</h3>' } }))
    // Экран запоминается якорем единого окна.
    expect(mocks.updateManyUser).toHaveBeenCalledWith(expect.objectContaining({ data: { botScreenMessageId: 901 } }))
  })

  it('с якорем /start правит существующее окно, новое сообщение не шлётся', async () => {
    mocks.findFirstUser.mockResolvedValue({ botScreenMessageId: 555 })
    await handleMiniAppUpdate({ update_id: 2, message: { message_id: 11, from: { id: 123 },
      chat: { id: 123, type: 'private' }, text: '/start' } })

    expect(mocks.botCall).toHaveBeenCalledWith('editMessageText', expect.objectContaining({
      chat_id: 123, message_id: 555, rich_message: { html: '<h3>🏠 Главная</h3>' } }))
    expect(mocks.botCall.mock.calls.some(([method]) => method === 'sendRichMessage')).toBe(false)
  })

  it('окно, уехавшее вверх по истории, удаляется — экран показывается свежим внизу', async () => {
    mocks.findFirstUser.mockResolvedValue({ botScreenMessageId: 5 }) // давно похоронено под другими сообщениями
    await handleMiniAppUpdate({ update_id: 3, message: { message_id: 100, from: { id: 123 },
      chat: { id: 123, type: 'private' }, text: '/start' } })

    expect(mocks.botCall).toHaveBeenCalledWith('deleteMessage', { chat_id: 123, message_id: 5 })
    expect(mocks.botCall.mock.calls.some(([method]) => method === 'editMessageText')).toBe(false)
    expect(mocks.botCall.mock.calls.some(([method]) => method === 'sendRichMessage')).toBe(true)
    expect(mocks.updateManyUser).toHaveBeenCalledWith(expect.objectContaining({ data: { botScreenMessageId: 901 } }))
  })
})
