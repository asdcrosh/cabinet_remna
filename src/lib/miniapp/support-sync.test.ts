import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    supportTicket: {
      findUnique: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  },
  getBotSupportThreadScreen: vi.fn(async () => '<h3>Тред пользователя</h3>'),
  getBotAdminThreadScreen: vi.fn(async () => '<h3>Тред администратора</h3>'),
  displayCallbackScreen: vi.fn(async (_chatId: number, messageId: number) => messageId),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./bot-screens', () => ({
  getBotSupportThreadScreen: mocks.getBotSupportThreadScreen,
  getBotAdminThreadScreen: mocks.getBotAdminThreadScreen,
}))
vi.mock('./callback-screen', () => ({ displayCallbackScreen: mocks.displayCallbackScreen }))

import { refreshAdminThreadView, refreshUserThreadView, syncSupportThreadViews } from './support-sync'

describe('support thread view sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.supportTicket.updateMany.mockResolvedValue({ count: 1 })
    mocks.displayCallbackScreen.mockImplementation(async (_chatId: number, messageId: number) => messageId)
  })

  it('does nothing without a stored anchor', async () => {
    mocks.prisma.supportTicket.findUnique.mockResolvedValue({ userBotMessageId: null, user: { telegramId: 123n } })
    expect(await refreshUserThreadView('ticket-1')).toBe(false)
    expect(mocks.displayCallbackScreen).not.toHaveBeenCalled()
  })

  it('edits the stored user thread message in place', async () => {
    mocks.prisma.supportTicket.findUnique.mockResolvedValue({ userBotMessageId: 555, user: { telegramId: 123n } })
    expect(await refreshUserThreadView('ticket-1')).toBe(true)
    expect(mocks.getBotSupportThreadScreen).toHaveBeenCalledWith(123, 'ticket-1')
    expect(mocks.displayCallbackScreen).toHaveBeenCalledWith(123, 555, '<h3>Тред пользователя</h3>')
    expect(mocks.prisma.supportTicket.updateMany).not.toHaveBeenCalled()
  })

  it('moves the anchor when Telegram delivered the screen as a new message', async () => {
    mocks.prisma.supportTicket.findUnique.mockResolvedValue({ userBotMessageId: 555, user: { telegramId: 123n } })
    mocks.displayCallbackScreen.mockResolvedValue(777)
    expect(await refreshUserThreadView('ticket-1')).toBe(true)
    expect(mocks.prisma.supportTicket.updateMany).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: { userBotMessageId: 777 },
    })
  })

  it('edits the admin thread view with a notice', async () => {
    mocks.prisma.supportTicket.findUnique.mockResolvedValue({ adminBotChatId: 900n, adminBotMessageId: 42 })
    expect(await refreshAdminThreadView('ticket-1', 'Новое сообщение')).toBe(true)
    expect(mocks.getBotAdminThreadScreen).toHaveBeenCalledWith(900, 'ticket-1', 'Новое сообщение')
    expect(mocks.displayCallbackScreen).toHaveBeenCalledWith(900, 42, '<h3>Тред администратора</h3>')
  })

  it('swallows refresh failures in syncSupportThreadViews', async () => {
    mocks.prisma.supportTicket.findUnique.mockResolvedValue({ userBotMessageId: 1, user: { telegramId: 123n }, adminBotChatId: 900n, adminBotMessageId: 2 })
    mocks.displayCallbackScreen.mockRejectedValue(new Error('Telegram sendRichMessage failed'))
    await expect(syncSupportThreadViews('ticket-1', { user: true, admin: true })).resolves.toBeUndefined()
  })
})
