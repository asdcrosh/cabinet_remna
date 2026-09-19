import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    broadcastCampaign: { findUnique: vi.fn() },
    broadcastDelivery: { count: vi.fn(), findMany: vi.fn() },
    notificationLog: { findMany: vi.fn() },
    userNotification: { findMany: vi.fn() },
    $transaction: vi.fn(),
  }
  return { prisma, requireAdmin: vi.fn() }
})

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (...args: never[]) => unknown) => handler,
}))
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: vi.fn(async () => true) }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))

import { GET } from './route'

describe('broadcast delivery details route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.broadcastCampaign.findUnique.mockResolvedValue({ id: 'campaign-1' })
    mocks.prisma.broadcastDelivery.count.mockResolvedValue(1)
    mocks.prisma.broadcastDelivery.findMany.mockResolvedValue([{
      id: 'delivery-1',
      status: 'UNKNOWN',
      attempts: 1,
      lastError: 'Неизвестен результат доставки: Telegram',
      sentAt: null,
      createdAt: new Date('2026-09-19T20:00:00.000Z'),
      payload: {
        dedupeKey: 'broadcast-1:user-1',
        inApp: true,
        telegramText: 'Текст',
        emailText: 'Текст',
      },
      user: { email: 'user@example.com', name: 'Пользователь' },
    }])
    mocks.prisma.$transaction.mockImplementation(async (items: Array<Promise<unknown>>) => Promise.all(items))
    mocks.prisma.notificationLog.findMany.mockResolvedValue([
      { dedupeKey: 'BROADCAST:broadcast-1:user-1', channel: 'TELEGRAM', status: 'UNKNOWN', error: 'timeout' },
      { dedupeKey: 'BROADCAST:broadcast-1:user-1', channel: 'EMAIL', status: 'FAILED', error: 'blocked' },
    ])
    mocks.prisma.userNotification.findMany.mockResolvedValue([
      { dedupeKey: 'BROADCAST:broadcast-1:user-1' },
    ])
  })

  it('returns separate delivered, failed and unknown channel states', async () => {
    const response = await GET(
      new Request('https://cabinet.example/api/admin/broadcasts/campaign-1/deliveries?status=UNKNOWN'),
      { params: Promise.resolve({ id: 'campaign-1' }) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      deliveries: [{
        id: 'delivery-1',
        status: 'UNKNOWN',
        channels: {
          inApp: { status: 'SENT' },
          telegram: { status: 'UNKNOWN', error: 'timeout' },
          email: { status: 'FAILED', error: 'blocked' },
        },
      }],
    })
  })
})
