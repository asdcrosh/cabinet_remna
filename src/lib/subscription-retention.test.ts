import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  retentionFindFirst: vi.fn(),
  retentionCreate: vi.fn(),
  retentionUpdate: vi.fn(),
  subscriptionUpdate: vi.fn(),
  transaction: vi.fn(),
  disableAutoRenewal: vi.fn(),
  disableUser: vi.fn(),
  enableUser: vi.fn(),
  updateUser: vi.fn(),
  notifyUser: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    subscription: { update: mocks.subscriptionUpdate },
    subscriptionRetention: {
      findFirst: mocks.retentionFindFirst,
      create: mocks.retentionCreate,
      update: mocks.retentionUpdate,
    },
    $transaction: mocks.transaction,
  },
}))
vi.mock('./auto-renewal', () => ({ disableAutoRenewal: mocks.disableAutoRenewal }))
vi.mock('./app-url', () => ({ getAppUrl: () => 'https://example.test' }))
vi.mock('./logger', () => ({ logError: vi.fn(), logInfo: vi.fn() }))
vi.mock('./notifications', () => ({ notifyUser: mocks.notifyUser }))
vi.mock('./remnawave', () => ({
  remnawave: {
    disableUser: mocks.disableUser,
    enableUser: mocks.enableUser,
    updateUser: mocks.updateUser,
  },
  hasRemnawaveUserReference: (user: any) => Boolean(user.remnawaveUuid),
  remnawaveUserReference: (user: any) => ({ uuid: user.remnawaveUuid }),
}))

import { pauseSubscription, resumeSubscription } from './subscription-retention'

const DAY_SECONDS = 24n * 60n * 60n

describe('subscription retention with whitelist add-on', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'))
    mocks.disableUser.mockResolvedValue({})
    mocks.enableUser.mockResolvedValue({})
    mocks.updateUser.mockResolvedValue({})
    mocks.disableAutoRenewal.mockResolvedValue({})
    mocks.notifyUser.mockResolvedValue({})
    mocks.subscriptionUpdate.mockResolvedValue({})
    mocks.retentionCreate.mockResolvedValue({ id: 'pause-1' })
    mocks.retentionUpdate.mockResolvedValue({})
    mocks.transaction.mockImplementation(async (input) => {
      if (Array.isArray(input)) return Promise.all(input)
      return input({
        subscription: { update: mocks.subscriptionUpdate },
        subscriptionRetention: { create: mocks.retentionCreate },
      })
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pauses the add-on together with a manually paused main subscription', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: 'rw-1',
      subscriptions: [{
        id: 'subscription-1',
        expireAt: new Date('2026-09-11T00:00:00.000Z'),
        whitelistAddonActive: true,
        whitelistAddonExpireAt: new Date('2026-10-01T00:00:00.000Z'),
        whitelistAddonRemainingSeconds: null,
        plan: { name: 'Основной' },
      }],
    })
    mocks.retentionFindFirst.mockResolvedValue(null)

    await pauseSubscription({
      userId: 'user-1',
      reason: 'NOT_USING',
      pauseDays: 7,
    })

    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith({
      where: { id: 'subscription-1' },
      data: expect.objectContaining({
        status: 'PAUSED',
        whitelistAddonActive: false,
        whitelistAddonExpireAt: null,
        whitelistAddonPausedAt: new Date('2026-09-01T00:00:00.000Z'),
        whitelistAddonRemainingSeconds: 30n * DAY_SECONDS,
      }),
    })
  })

  it('resumes both balances and restores add-on squads', async () => {
    mocks.retentionFindFirst.mockResolvedValue({
      id: 'pause-1',
      userId: 'user-1',
      reason: 'NOT_USING',
      remainingSeconds: 7n * DAY_SECONDS,
      user: { id: 'user-1', remnawaveUuid: 'rw-1' },
      subscription: {
        id: 'subscription-1',
        whitelistAddonRemainingSeconds: 20n * DAY_SECONDS,
        whitelistAddonInternalSquads: ['addon-squad'],
        plan: { name: 'Основной', activeInternalSquads: ['base-squad'] },
      },
    })

    await resumeSubscription('user-1')

    expect(mocks.updateUser).toHaveBeenCalledWith(
      { uuid: 'rw-1' },
      {
        expireAt: '2026-09-08T00:00:00.000Z',
        activeInternalSquads: ['base-squad', 'addon-squad'],
      }
    )
    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith({
      where: { id: 'subscription-1' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        whitelistAddonActive: true,
        whitelistAddonExpireAt: new Date('2026-09-21T00:00:00.000Z'),
        whitelistAddonRemainingSeconds: null,
      }),
    })
  })
})
