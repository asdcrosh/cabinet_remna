import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: { subscription: { findMany: mocks.findMany } },
}))
vi.mock('./notifications', () => ({
  notifyWhitelistAddonExpiring: mocks.notify,
}))

import { reconcileWhitelistAddonExpiryNotifications } from './whitelist-addon-expiry-notifications'

describe('whitelist add-on expiry notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.notify.mockResolvedValue(undefined)
  })

  it('notifies active add-ons expiring within three days', async () => {
    const now = new Date('2026-08-23T12:00:00.000Z')
    const expireAt = new Date('2026-08-26T11:00:00.000Z')
    mocks.findMany.mockResolvedValue([
      { id: 'subscription-1', userId: 'user-1', whitelistAddonExpireAt: expireAt },
    ])

    await expect(reconcileWhitelistAddonExpiryNotifications({ now, batchSize: 50 })).resolves.toEqual({
      checked: 1,
      sent: 1,
    })
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        whitelistAddonActive: true,
        whitelistAddonExpireAt: {
          gt: now,
          lte: new Date('2026-08-26T12:00:00.000Z'),
        },
      },
      take: 50,
    }))
    expect(mocks.notify).toHaveBeenCalledWith({
      userId: 'user-1',
      subscriptionId: 'subscription-1',
      expireAt,
    })
  })
})
