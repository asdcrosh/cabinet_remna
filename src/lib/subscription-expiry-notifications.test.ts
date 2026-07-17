import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: { subscription: { findMany: mocks.findMany } },
}))
vi.mock('./notifications', () => ({
  notifySubscriptionExpiring: mocks.notify,
}))

import { reconcileSubscriptionExpiryNotifications } from './subscription-expiry-notifications'

describe('subscription expiry notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.notify.mockResolvedValue(undefined)
  })

  it('sends 3 day, 1 day and expired stages in one reconciliation', async () => {
    const now = new Date('2026-07-17T12:00:00.000Z')
    mocks.findMany
      .mockResolvedValueOnce([
        { id: 'sub-3d', userId: 'user-1', expireAt: new Date('2026-07-20T11:00:00.000Z'), plan: { name: 'Три дня' } },
        { id: 'sub-1d', userId: 'user-2', expireAt: new Date('2026-07-18T11:00:00.000Z'), plan: { name: 'Сутки' } },
      ])
      .mockResolvedValueOnce([
        { id: 'sub-expired', userId: 'user-3', expireAt: new Date('2026-07-17T11:59:00.000Z'), plan: { name: 'Истёк' } },
      ])

    await expect(reconcileSubscriptionExpiryNotifications({ now, batchSize: 50 })).resolves.toEqual({
      checked: 3,
      sent: 3,
    })
    expect(mocks.notify).toHaveBeenNthCalledWith(1, expect.objectContaining({ subscriptionId: 'sub-3d', stage: '3d' }))
    expect(mocks.notify).toHaveBeenNthCalledWith(2, expect.objectContaining({ subscriptionId: 'sub-1d', stage: '1d' }))
    expect(mocks.notify).toHaveBeenNthCalledWith(3, expect.objectContaining({ subscriptionId: 'sub-expired', stage: 'expired' }))
  })

  it('only scans subscriptions expired within the last day', async () => {
    const now = new Date('2026-07-17T12:00:00.000Z')
    mocks.findMany.mockResolvedValue([])

    await reconcileSubscriptionExpiryNotifications({ now })

    const expiredQuery = mocks.findMany.mock.calls[1]?.[0]
    expect(expiredQuery.where.expireAt).toEqual({
      gt: new Date('2026-07-16T12:00:00.000Z'),
      lte: now,
    })
    expect(expiredQuery.where.status.in).toContain('EXPIRED')
  })
})
