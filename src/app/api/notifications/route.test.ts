import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  userNotification: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}))
vi.mock('@/lib/prisma', () => ({ prisma: { userNotification: mocks.userNotification } }))

import { GET, PATCH } from './route'

describe('user notifications route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1', role: 'USER' })
    mocks.userNotification.updateMany.mockResolvedValue({ count: 2 })
  })

  it('loads the next page after a cursor and returns another cursor', async () => {
    const cursorDate = new Date('2026-09-07T10:00:00.000Z')
    mocks.userNotification.findFirst.mockResolvedValue({ id: 'notification-3', createdAt: cursorDate })
    mocks.userNotification.findMany.mockResolvedValue([
      notification('notification-2', '2026-09-07T09:00:00.000Z'),
      notification('notification-1', '2026-09-07T08:00:00.000Z'),
    ])

    const response = await GET(new Request('https://cabinet.example/api/notifications?cursor=notification-3&take=1'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.userNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 2,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where: expect.objectContaining({ userId: 'user-1' }),
    }))
    expect(body.notifications).toHaveLength(1)
    expect(body.hasMore).toBe(true)
    expect(body.nextCursor).toBe('notification-2')
  })

  it('marks a notification group in one request', async () => {
    const response = await PATCH(new Request('https://cabinet.example/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ ids: ['notification-1', 'notification-2', 'notification-1'] }),
    }))

    expect(response.status).toBe(200)
    expect(mocks.userNotification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        readAt: null,
        id: { in: ['notification-1', 'notification-2'] },
      },
      data: { readAt: expect.any(Date) },
    })
  })

  it('rejects malformed group updates', async () => {
    const response = await PATCH(new Request('https://cabinet.example/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ ids: [] }),
    }))

    expect(response.status).toBe(400)
    expect(mocks.userNotification.updateMany).not.toHaveBeenCalled()
  })
})

function notification(id: string, createdAt: string) {
  return {
    id,
    type: 'PAYMENT_SUCCESS',
    title: 'Оплата прошла',
    body: 'Подписка продлена',
    actionHref: '/dashboard/billing',
    actionLabel: 'Открыть',
    readAt: null,
    createdAt: new Date(createdAt),
    userId: 'user-1',
    dedupeKey: null,
  }
}
