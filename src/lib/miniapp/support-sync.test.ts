import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    supportTicket: {
      findUnique: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    user: {
      findMany: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  },
  getBotSupportThreadScreen: vi.fn(async () => '<h3>Тред пользователя</h3>'),
  getBotAdminThreadScreen: vi.fn(async () => '<h3>Тред администратора</h3>'),
  getBotAdminTicketsScreen: vi.fn(async () => '<h3>Очередь обращений</h3>'),
  displayCallbackScreen: vi.fn(async (_chatId: number, messageId: number) => messageId),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./bot-screens', () => ({
  getBotSupportThreadScreen: mocks.getBotSupportThreadScreen,
  getBotAdminThreadScreen: mocks.getBotAdminThreadScreen,
  getBotAdminTicketsScreen: mocks.getBotAdminTicketsScreen,
}))
vi.mock('./callback-screen', () => ({ displayCallbackScreen: mocks.displayCallbackScreen }))

import { refreshAdminThreadView, refreshUserThreadView, refreshAdminTicketsQueues, syncAdminTicketsQueues, syncSupportThreadViews } from './support-sync'

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

describe('admin tickets queue sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 1 })
    mocks.displayCallbackScreen.mockImplementation(async (_chatId: number, messageId: number) => messageId)
  })

  it('does nothing when no admin has an open queue', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([])
    await refreshAdminTicketsQueues()
    expect(mocks.getBotAdminTicketsScreen).not.toHaveBeenCalled()
    expect(mocks.displayCallbackScreen).not.toHaveBeenCalled()
  })

  it('edits the queue message for every admin with an anchor', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: 'admin-1', telegramId: 900n, adminQueueBotMessageId: 10 },
      { id: 'admin-2', telegramId: 901n, adminQueueBotMessageId: 20 },
    ])
    await refreshAdminTicketsQueues('🆕 Новое обращение в очереди.')
    expect(mocks.getBotAdminTicketsScreen).toHaveBeenCalledWith(900, '🆕 Новое обращение в очереди.')
    expect(mocks.getBotAdminTicketsScreen).toHaveBeenCalledWith(901, '🆕 Новое обращение в очереди.')
    expect(mocks.displayCallbackScreen).toHaveBeenCalledWith(900, 10, '<h3>Очередь обращений</h3>')
    expect(mocks.displayCallbackScreen).toHaveBeenCalledWith(901, 20, '<h3>Очередь обращений</h3>')
    expect(mocks.prisma.user.updateMany).not.toHaveBeenCalled()
  })

  it('moves the queue anchor when the screen is delivered as a new message', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ id: 'admin-1', telegramId: 900n, adminQueueBotMessageId: 10 }])
    mocks.displayCallbackScreen.mockResolvedValue(33)
    await refreshAdminTicketsQueues()
    expect(mocks.prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'admin-1' }, data: { adminQueueBotMessageId: 33 } })
  })

  it('keeps the queue sync best-effort', async () => {
    mocks.prisma.user.findMany.mockRejectedValue(new Error('db down'))
    await expect(syncAdminTicketsQueues()).resolves.toBeUndefined()
  })
})
