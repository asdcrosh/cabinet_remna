import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class TestRemnawaveError extends Error {
    constructor(public status: number, public body: unknown) {
      super('Remnawave error')
    }
  }
  return {
    TestRemnawaveError,
    userFindUnique: vi.fn(),
    subscriptionUpdateMany: vi.fn(),
    deviceDeleteMany: vi.fn(),
    transaction: vi.fn(),
    updateUser: vi.fn(),
    resetTraffic: vi.fn(),
    getUserDevices: vi.fn(),
    deleteUserDevice: vi.fn(),
    removeRemnashopSubscription: vi.fn(),
    markSyncFailed: vi.fn(),
    markSyncSkipped: vi.fn(),
    markSyncSucceeded: vi.fn(),
    notifySubscriptionTerminated: vi.fn(),
  }
})

vi.mock('./prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    $transaction: mocks.transaction,
  },
}))
vi.mock('./remnawave', () => ({
  remnawave: {
    updateUser: mocks.updateUser,
    resetTraffic: mocks.resetTraffic,
    getUserDevices: mocks.getUserDevices,
    deleteUserDevice: mocks.deleteUserDevice,
  },
  RemnawaveError: mocks.TestRemnawaveError,
}))
vi.mock('./remnashop-subscription-removal', () => ({
  removeRemnashopSubscription: mocks.removeRemnashopSubscription,
}))
vi.mock('./sync-events', () => ({
  markSyncFailed: mocks.markSyncFailed,
  markSyncSkipped: mocks.markSyncSkipped,
  markSyncSucceeded: mocks.markSyncSucceeded,
}))
vi.mock('./notifications', () => ({
  notifySubscriptionTerminated: mocks.notifySubscriptionTerminated,
}))

import { terminateUserSubscription } from './subscription-termination'

describe('terminateUserSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.REMNASHOP_DATABASE_URL
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: 'uuid-1',
      remnashopUserId: null,
      subscriptions: [{ id: 'subscription-1' }],
    })
    mocks.updateUser.mockResolvedValue({ response: { status: 'DISABLED' } })
    mocks.resetTraffic.mockResolvedValue({ response: { usedTrafficBytes: '0' } })
    mocks.getUserDevices.mockResolvedValue({
      response: { total: 2, devices: [{ hwid: 'device-1' }, { hwid: 'device-2' }] },
    })
    mocks.deleteUserDevice.mockResolvedValue({ response: [] })
    mocks.transaction.mockImplementation(async (callback) => callback({
      subscription: { updateMany: mocks.subscriptionUpdateMany },
      device: { deleteMany: mocks.deviceDeleteMany },
    }))
  })

  it('disables access without deleting the Remnawave profile', async () => {
    const result = await terminateUserSubscription({
      userId: 'user-1',
      source: 'USER_REQUEST',
    })

    expect(result).toEqual({ hadSubscription: true })
    expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({
      uuid: 'uuid-1',
      status: 'DISABLED',
      expireAt: expect.any(String),
    }))
    expect(mocks.resetTraffic).toHaveBeenCalledWith('uuid-1')
    expect(mocks.deleteUserDevice).toHaveBeenCalledTimes(2)
    expect(mocks.deleteUserDevice).toHaveBeenCalledWith('uuid-1', 'device-1')
    expect(mocks.deleteUserDevice).toHaveBeenCalledWith('uuid-1', 'device-2')
    expect(mocks.subscriptionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', status: { in: ['ACTIVE', 'LIMITED'] } },
      data: expect.objectContaining({
        status: 'DISABLED',
        trafficLimitBytes: 0n,
        trafficUsedBytes: 0n,
        pendingSync: false,
      }),
    }))
    expect(mocks.deviceDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    expect(mocks.notifySubscriptionTerminated).toHaveBeenCalledWith({
      userId: 'user-1',
      source: 'USER_REQUEST',
      dedupeId: 'subscription:subscription-1',
    })
  })

  it('finishes local cleanup when the Remnawave profile was already deleted', async () => {
    mocks.updateUser.mockRejectedValue(new mocks.TestRemnawaveError(404, null))

    await expect(terminateUserSubscription({
      userId: 'user-1',
      source: 'YOOKASSA_REFUND',
    })).resolves.toEqual({ hadSubscription: true })
  })

  it('uses the payment as notification dedupe key for repeated refund webhooks', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: null,
      remnashopUserId: null,
      subscriptions: [],
    })

    await expect(terminateUserSubscription({
      userId: 'user-1',
      source: 'YOOKASSA_REFUND',
      paymentId: 'payment-1',
    })).resolves.toEqual({ hadSubscription: false })

    expect(mocks.notifySubscriptionTerminated).toHaveBeenCalledWith({
      userId: 'user-1',
      source: 'YOOKASSA_REFUND',
      dedupeId: 'payment:payment-1',
    })
  })

  it('does not clear local identifiers when Remnawave is unavailable', async () => {
    mocks.updateUser.mockRejectedValue(new mocks.TestRemnawaveError(503, null))

    await expect(terminateUserSubscription({
      userId: 'user-1',
      source: 'USER_REQUEST',
    })).rejects.toBeInstanceOf(mocks.TestRemnawaveError)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
