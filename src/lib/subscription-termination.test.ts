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
    userUpdate: vi.fn(),
    transaction: vi.fn(),
    deleteUser: vi.fn(),
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
  remnawave: { deleteUser: mocks.deleteUser },
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
    mocks.deleteUser.mockResolvedValue({ response: { isDeleted: true } })
    mocks.transaction.mockImplementation(async (callback) => callback({
      subscription: { updateMany: mocks.subscriptionUpdateMany },
      device: { deleteMany: mocks.deviceDeleteMany },
      user: { update: mocks.userUpdate },
    }))
  })

  it('deletes the Remnawave user and disables local access', async () => {
    const result = await terminateUserSubscription({
      userId: 'user-1',
      source: 'USER_REQUEST',
    })

    expect(result).toEqual({ hadSubscription: true })
    expect(mocks.deleteUser).toHaveBeenCalledWith('uuid-1')
    expect(mocks.subscriptionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', status: { in: ['ACTIVE', 'LIMITED'] } },
      data: expect.objectContaining({ status: 'DISABLED', pendingSync: false }),
    }))
    expect(mocks.deviceDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        remnawaveUuid: null,
        remnawaveShortUuid: null,
        remnawaveUsername: null,
      },
    })
    expect(mocks.notifySubscriptionTerminated).toHaveBeenCalledWith({
      userId: 'user-1',
      source: 'USER_REQUEST',
      dedupeId: 'subscription:subscription-1',
    })
  })

  it('finishes local cleanup when Remnawave already deleted the user', async () => {
    mocks.deleteUser.mockRejectedValue(new mocks.TestRemnawaveError(404, null))

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
    mocks.deleteUser.mockRejectedValue(new mocks.TestRemnawaveError(503, null))

    await expect(terminateUserSubscription({
      userId: 'user-1',
      source: 'USER_REQUEST',
    })).rejects.toBeInstanceOf(mocks.TestRemnawaveError)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
