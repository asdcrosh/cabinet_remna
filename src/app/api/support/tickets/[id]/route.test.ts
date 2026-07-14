import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  prisma: {
    supportTicket: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: () => true }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn() }))
vi.mock('@/lib/admin-notifications', () => ({ createAdminNotification: vi.fn() }))

import { GET } from './route'

function makeMessages() {
  return Array.from({ length: 51 }, (_, index) => {
    const number = 51 - index
    return {
      id: `message-${number}`,
      body: `Сообщение ${number}`,
      senderRole: 'USER',
      createdAt: new Date(`2026-07-14T${String(number % 24).padStart(2, '0')}:00:00.000Z`),
      sender: { email: 'user@example.com', name: 'User' },
    }
  })
}

describe('support ticket message pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1', role: 'USER' })
    mocks.prisma.supportTicket.findFirst.mockResolvedValue({
      id: 'ticket-1',
      userId: 'user-1',
      subject: 'Подключение',
      category: 'connection',
      status: 'WAITING_USER',
      userUnreadCount: 2,
      adminUnreadCount: 0,
      lastMessageAt: new Date('2026-07-14T12:00:00.000Z'),
      closedAt: null,
      createdAt: new Date('2026-07-13T12:00:00.000Z'),
      updatedAt: new Date('2026-07-14T12:00:00.000Z'),
      messages: makeMessages(),
    })
    mocks.prisma.supportTicket.update.mockResolvedValue({ id: 'ticket-1' })
  })

  it('loads 50 older messages by cursor and returns the next cursor', async () => {
    const response = await GET(
      new Request('https://cabinet.example/api/support/tickets/ticket-1?before=anchor-message'),
      { params: Promise.resolve({ id: 'ticket-1' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.prisma.supportTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ticket-1', userId: 'user-1' },
      include: expect.objectContaining({
        messages: expect.objectContaining({
          orderBy: { createdAt: 'desc' },
          take: 51,
          cursor: { id: 'anchor-message' },
          skip: 1,
        }),
      }),
    }))
    expect(body.ticket.messages).toHaveLength(50)
    expect(body.ticket.messages[0].id).toBe('message-2')
    expect(body.ticket.messages[49].id).toBe('message-51')
    expect(body.ticket.messagePagination).toEqual({
      hasMore: true,
      before: 'message-2',
    })
    expect(mocks.prisma.supportTicket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: { userUnreadCount: 0 },
    })
  })
})
