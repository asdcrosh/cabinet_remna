import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
  subscriptionUpdate: vi.fn(),
  paymentUpdate: vi.fn(),
  transaction: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    payment: { findUnique: mocks.paymentFindUnique },
    $transaction: mocks.transaction,
  },
}))
vi.mock('./remnawave', () => ({
  hasRemnawaveUserReference: () => true,
  remnawaveUserReference: () => ({ id: 42 }),
  remnawave: { updateUser: mocks.updateUser },
}))

import { provisionDeviceLimitAddon } from './device-limit-addon'

describe('provisionDeviceLimitAddon', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const subscription = {
      id: 'sub-1',
      userId: 'user-1',
      status: 'ACTIVE',
      expireAt: new Date(Date.now() + 10 * 86_400_000),
      deviceLimit: 3,
    }
    mocks.paymentFindUnique.mockResolvedValue({
      id: 'pay-1',
      userId: 'user-1',
      purchaseType: 'DEVICE_LIMIT_ADDON',
      paidAt: new Date(),
      subscriptionProvisionedAt: null,
      addonSnapshot: {
        type: 'DEVICE_LIMIT_ADDON',
        subscriptionId: 'sub-1',
        fromLimit: 3,
        toLimit: 5,
        additionalDevices: 2,
        remainingDays: 10,
        priceKopecks: 6700,
      },
      user: { id: 'user-1', remnawaveId: 42 },
      subscription,
    })
    mocks.updateUser.mockResolvedValue({ response: { id: 42, hwidDeviceLimit: 5 } })
    mocks.subscriptionUpdate.mockResolvedValue({ ...subscription, deviceLimit: 5 })
    mocks.paymentUpdate.mockResolvedValue({})
    mocks.transaction.mockImplementation((callback) => callback({
      subscription: { update: mocks.subscriptionUpdate },
      payment: { update: mocks.paymentUpdate },
    }))
  })

  it('updates only the device limit and keeps the subscription dates', async () => {
    const result = await provisionDeviceLimitAddon('pay-1')

    expect(mocks.updateUser).toHaveBeenCalledWith({ id: 42 }, { hwidDeviceLimit: 5 })
    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { deviceLimit: 5, lastSyncedAt: expect.any(Date) },
    })
    expect(result.subscription.deviceLimit).toBe(5)
  })
})
