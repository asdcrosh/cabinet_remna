import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userUpdate: vi.fn(),
  subscriptionFindFirst: vi.fn(),
  subscriptionUpdate: vi.fn(),
  subscriptionUpdateMany: vi.fn(),
  subscriptionCreate: vi.fn(),
  retentionFindFirst: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    user: { update: mocks.userUpdate },
    subscription: {
      findFirst: mocks.subscriptionFindFirst,
      update: mocks.subscriptionUpdate,
      updateMany: mocks.subscriptionUpdateMany,
      create: mocks.subscriptionCreate,
    },
    subscriptionRetention: { findFirst: mocks.retentionFindFirst },
  },
}))

import {
  normalizeRemnawaveDeviceLimit,
  shouldReplacePlanFromExternalSync,
  upsertLocalSubscriptionFromRemnawave,
} from './remnawave-local-sync'

describe('upsertLocalSubscriptionFromRemnawave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-30T12:00:00.000Z'))
    mocks.userUpdate.mockResolvedValue({})
    mocks.subscriptionUpdate.mockResolvedValue({ id: 'subscription-1' })
    mocks.retentionFindFirst.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('accepts a Remnawave renewal after an old grace period', async () => {
    const remoteExpireAt = new Date('2026-09-29T12:00:00.000Z')
    mocks.subscriptionFindFirst.mockResolvedValue({
      id: 'subscription-1',
      userId: 'user-1',
      planManagedByCabinet: false,
      expireAt: new Date('2026-08-27T12:00:00.000Z'),
      graceStartedAt: new Date('2026-08-27T12:00:00.000Z'),
      graceExpireAt: new Date('2026-08-28T12:00:00.000Z'),
    })

    await upsertLocalSubscriptionFromRemnawave({
      localUserId: 'user-1',
      remnawaveUser: {
        id: 42,
        uuid: 'remnawave-1',
        shortUuid: 'short-1',
        username: 'user_1',
        status: 'ACTIVE',
        usedTrafficBytes: '0',
        lifetimeUsedTrafficBytes: '0',
        trafficLimitBytes: '0',
        trafficLimitStrategy: 'MONTH',
        expireAt: remoteExpireAt.toISOString(),
        createdAt: '2026-01-01T00:00:00.000Z',
        vlessUuid: 'vless',
        trojanPassword: 'trojan',
        ssPassword: 'ss',
        hwidDeviceLimit: 5,
      },
    })

    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith({
      where: { id: 'subscription-1' },
      data: expect.objectContaining({
        expireAt: remoteExpireAt,
        status: 'ACTIVE',
        graceStartedAt: null,
        graceExpireAt: null,
      }),
    })
  })

  it('preserves unused add-on time when a gift renews an expired main subscription before the pause worker', async () => {
    mocks.subscriptionFindFirst.mockResolvedValue({
      id: 'subscription-1', expireAt: new Date('2026-08-20T00:00:00Z'), status: 'EXPIRED',
      whitelistAddonActive: true, whitelistAddonExpireAt: new Date('2026-08-23T00:00:00Z'),
    })
    await upsertLocalSubscriptionFromRemnawave({ localUserId: 'user-1', remnawaveUser: {
      uuid: 'remote', status: 'ACTIVE', expireAt: '2026-09-30T00:00:00Z', createdAt: '2026-01-01T00:00:00Z',
    } as any })
    expect(mocks.subscriptionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'subscription-1', whitelistAddonActive: true, whitelistAddonExpireAt: new Date('2026-08-23T00:00:00Z') },
      data: { whitelistAddonActive: false, whitelistAddonExpireAt: null, whitelistAddonPausedAt: new Date('2026-08-20T00:00:00Z'), whitelistAddonRemainingSeconds: 3n * 86400n },
    })
    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE', expireAt: new Date('2026-09-30T00:00:00Z') }) }))
  })
})

describe('shouldReplacePlanFromExternalSync', () => {
  it('does not overwrite a plan managed by the cabinet', () => {
    expect(shouldReplacePlanFromExternalSync({ planManagedByCabinet: true }, 'legacy-plan')).toBe(false)
  })

  it('fills or refreshes a plan still managed by external synchronization', () => {
    expect(shouldReplacePlanFromExternalSync(null, 'legacy-plan')).toBe(true)
    expect(shouldReplacePlanFromExternalSync({ planManagedByCabinet: false }, 'legacy-plan')).toBe(true)
    expect(shouldReplacePlanFromExternalSync({ planManagedByCabinet: false }, null)).toBe(false)
  })
})

describe('normalizeRemnawaveDeviceLimit', () => {
  it('keeps a positive per-user HWID limit', () => {
    expect(normalizeRemnawaveDeviceLimit(8)).toBe(8)
  })

  it('stores an absent Remnawave limit as null', () => {
    expect(normalizeRemnawaveDeviceLimit(0)).toBeNull()
    expect(normalizeRemnawaveDeviceLimit(null)).toBeNull()
    expect(normalizeRemnawaveDeviceLimit(undefined)).toBeNull()
  })
})
