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
    paymentFindUnique: vi.fn(),
    subscriptionUpdateMany: vi.fn(),
    deviceDeleteMany: vi.fn(),
    transaction: vi.fn(),
    disableUser: vi.fn(),
    updateUser: vi.fn(),
    resetTraffic: vi.fn(),
    deleteAllUserDevices: vi.fn(),
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
    payment: { findUnique: mocks.paymentFindUnique },
    $transaction: mocks.transaction,
  },
}))
vi.mock('./remnawave', () => ({
  remnawave: {
    disableUser: mocks.disableUser,
    updateUser: mocks.updateUser,
    resetTraffic: mocks.resetTraffic,
    deleteAllUserDevices: mocks.deleteAllUserDevices,
  },
  hasRemnawaveUserReference: (user: any) => Boolean(
    user.remnawaveId || user.remnawaveUuid || user.remnawaveUsername
  ),
  remnawaveUserReference: (user: any) => ({
    id: user.remnawaveId,
    uuid: user.remnawaveUuid,
    username: user.remnawaveUsername,
  }),
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
    mocks.paymentFindUnique.mockResolvedValue(null)
    mocks.disableUser.mockResolvedValue({ response: { id: 42, status: 'DISABLED' } })
    mocks.updateUser.mockResolvedValue({ response: { id: 42, status: 'DISABLED' } })
    mocks.resetTraffic.mockResolvedValue({ response: { usedTrafficBytes: '0' } })
    mocks.deleteAllUserDevices.mockResolvedValue({ response: { isDeleted: true } })
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
    expect(mocks.disableUser).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'uuid-1' }))
    expect(mocks.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 }),
      expect.objectContaining({ expireAt: expect.any(String) })
    )
    expect(mocks.resetTraffic).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }))
    expect(mocks.deleteAllUserDevices).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }))
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
    mocks.disableUser.mockRejectedValue(new mocks.TestRemnawaveError(404, null))

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
    mocks.disableUser.mockRejectedValue(new mocks.TestRemnawaveError(503, null))

    await expect(terminateUserSubscription({
      userId: 'user-1',
      source: 'USER_REQUEST',
    })).rejects.toBeInstanceOf(mocks.TestRemnawaveError)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('keeps the successful disable when optional Remnawave cleanup fails', async () => {
    mocks.updateUser.mockRejectedValue(new mocks.TestRemnawaveError(422, null))
    mocks.resetTraffic.mockRejectedValue(new mocks.TestRemnawaveError(503, null))
    mocks.deleteAllUserDevices.mockRejectedValue(new mocks.TestRemnawaveError(400, null))

    await expect(terminateUserSubscription({
      userId: 'user-1',
      source: 'ADMIN_REQUEST',
    })).resolves.toEqual({ hadSubscription: true })

    expect(mocks.disableUser).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'uuid-1' }))
    expect(mocks.transaction).toHaveBeenCalledOnce()
  })

  it('does not preserve a bundled add-on when its subscription payment is refunded', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: 'uuid-1',
      remnashopUserId: null,
      subscriptions: [{
        id: 'subscription-1',
        whitelistAddonActive: true,
        whitelistAddonExpireAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        whitelistAddonRemainingSeconds: null,
        whitelistAddonPaymentId: 'payment-1',
      }],
    })
    mocks.paymentFindUnique.mockResolvedValue({
      addonSnapshot: {
        type: 'WHITELIST_ADDON_BUNDLE',
        name: 'Доступ к серверам с белыми списками',
        planId: 'plan-1',
        priceKopecks: 20000,
        internalSquads: ['addon-squad'],
      },
    })

    await terminateUserSubscription({
      userId: 'user-1',
      source: 'YOOKASSA_REFUND',
      paymentId: 'payment-1',
    })

    expect(mocks.subscriptionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'subscription-1' },
      data: expect.objectContaining({
        whitelistAddonActive: false,
        whitelistAddonRemainingSeconds: null,
        whitelistAddonPaymentId: null,
      }),
    })
  })
})
