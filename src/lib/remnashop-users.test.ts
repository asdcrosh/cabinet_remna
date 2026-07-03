import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    plan: {
      findFirst: vi.fn(),
    },
  }
  const remnashopQuery = vi.fn()
  const remnawave = {
    getUserByUuid: vi.fn(),
    updateUser: vi.fn(),
  }
  const upsertLocalSubscriptionFromRemnawave = vi.fn()
  const generateUniqueReferralCode = vi.fn()

  return {
    prisma,
    remnashopQuery,
    remnawave,
    upsertLocalSubscriptionFromRemnawave,
    generateUniqueReferralCode,
  }
})

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./remnashop-db', () => ({ remnashopQuery: mocks.remnashopQuery }))
vi.mock('./remnawave', () => ({ remnawave: mocks.remnawave }))
vi.mock('./remnawave-local-sync', () => ({
  upsertLocalSubscriptionFromRemnawave: mocks.upsertLocalSubscriptionFromRemnawave,
}))
vi.mock('./referrals', () => ({ generateUniqueReferralCode: mocks.generateUniqueReferralCode }))

import { syncRemnashopUserToCabinet, syncRemnashopUsersToCabinet } from './remnashop-users'

const sourceUser = {
  id: 10,
  telegram_id: '123',
  email: null,
  is_email_verified: false,
  name: 'Егор',
  username: 'egor',
  user_remna_id: 'rw-1',
  subscription_created_at: new Date('2026-06-01T00:00:00.000Z'),
  subscription_plan_snapshot: { plan: { id: 77, name: 'Light' }, duration: { days: 7 } },
  subscription_traffic_limit: 0,
  subscription_device_limit: 5,
}

const remnawaveUser = {
  uuid: 'rw-1',
  shortUuid: 'short-1',
  username: 'rw_user',
  status: 'ACTIVE',
  usedTrafficBytes: '1024',
  lifetimeUsedTrafficBytes: '2048',
  trafficLimitBytes: '0',
  trafficLimitStrategy: 'MONTH',
  expireAt: '2026-07-24T00:00:00.000Z',
  createdAt: '2026-06-24T00:00:00.000Z',
  vlessUuid: 'vless',
  trojanPassword: 'trojan',
  ssPassword: 'ss',
}

describe('syncRemnashopUsersToCabinet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'))
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://cabinet@remnashop-db/remnashop'
    process.env.REMNASHOP_USER_SUBSCRIPTION_SYNC_STALE_SECONDS = '300'
    mocks.generateUniqueReferralCode.mockResolvedValue('REF123')
    mocks.prisma.plan.findFirst.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.REMNASHOP_DATABASE_URL
    delete process.env.REMNASHOP_USER_SUBSCRIPTION_SYNC_STALE_SECONDS
  })

  it('restores a local subscription from Remnawave when Remnashop has current user_remna_id', async () => {
    mocks.remnashopQuery.mockResolvedValue({ rows: [sourceUser] })
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'telegram-123@pending.invalid',
      name: null,
      remnashopUserId: 10,
      remnawaveUuid: null,
      remnawaveUsername: null,
      telegramId: 123n,
      telegramUsername: null,
      telegramLinkedAt: null,
      emailVerifiedAt: null,
      subscriptions: [],
    })
    mocks.prisma.user.update.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: null,
      remnawaveUsername: null,
      subscriptions: [],
    })
    mocks.remnawave.getUserByUuid.mockResolvedValue({ response: remnawaveUser })
    mocks.remnawave.updateUser.mockResolvedValue({ response: { ...remnawaveUser, telegramId: '123' } })
    mocks.upsertLocalSubscriptionFromRemnawave.mockResolvedValue({ id: 'sub-1' })
    mocks.prisma.plan.findFirst.mockResolvedValue({ id: 'plan-light-7' })

    const result = await syncRemnashopUsersToCabinet()

    expect(mocks.remnawave.getUserByUuid).toHaveBeenCalledWith('rw-1')
    expect(mocks.remnawave.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: 'rw-1', telegramId: 123, tag: 'IMPORTED' })
    )
    expect(mocks.prisma.plan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { remnashopPlanId: 77, durationDays: 7 },
      })
    )
    expect(mocks.upsertLocalSubscriptionFromRemnawave).toHaveBeenCalledWith({
      localUserId: 'user-1',
      remnashopUserId: 10,
      planId: 'plan-light-7',
      startAt: new Date('2026-06-01T00:00:00.000Z'),
      remnawaveUser: expect.objectContaining({ uuid: 'rw-1', username: 'rw_user' }),
    })
    expect(result.subscriptionsSynced).toBe(1)
    expect(result.subscriptionsFailed).toBe(0)
  })

  it('does not call Remnawave again for a fresh local subscription with the same UUID', async () => {
    const lastSyncedAt = new Date('2026-06-24T11:59:00.000Z')
    mocks.remnashopQuery.mockResolvedValue({ rows: [sourceUser] })
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'telegram-123@pending.invalid',
      name: 'Егор',
      remnashopUserId: 10,
      remnawaveUuid: 'rw-1',
      remnawaveUsername: 'rw_user',
      telegramId: 123n,
      telegramUsername: 'egor',
      telegramLinkedAt: new Date('2026-06-20T00:00:00.000Z'),
      emailVerifiedAt: null,
      subscriptions: [{ id: 'sub-1', lastSyncedAt }],
    })
    mocks.prisma.user.update.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: 'rw-1',
      remnawaveUsername: 'rw_user',
      subscriptions: [{ id: 'sub-1', lastSyncedAt }],
    })

    const result = await syncRemnashopUsersToCabinet()

    expect(mocks.remnawave.getUserByUuid).not.toHaveBeenCalled()
    expect(mocks.upsertLocalSubscriptionFromRemnawave).not.toHaveBeenCalled()
    expect(result.subscriptionsSkipped).toBe(1)
  })

  it('forces a Remnawave subscription refresh during manual sync', async () => {
    const lastSyncedAt = new Date('2026-06-24T11:59:00.000Z')
    mocks.remnashopQuery.mockResolvedValue({ rows: [sourceUser] })
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'telegram-123@pending.invalid',
      name: 'Егор',
      remnashopUserId: 10,
      remnawaveUuid: 'rw-1',
      remnawaveUsername: 'rw_user',
      telegramId: 123n,
      telegramUsername: 'egor',
      telegramLinkedAt: new Date('2026-06-20T00:00:00.000Z'),
      emailVerifiedAt: null,
      subscriptions: [{ id: 'sub-1', lastSyncedAt }],
    })
    mocks.prisma.user.update.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: 'rw-1',
      remnawaveUsername: 'rw_user',
      subscriptions: [{ id: 'sub-1', lastSyncedAt }],
    })
    mocks.remnawave.getUserByUuid.mockResolvedValue({ response: remnawaveUser })
    mocks.remnawave.updateUser.mockResolvedValue({ response: { ...remnawaveUser, telegramId: '123' } })
    mocks.upsertLocalSubscriptionFromRemnawave.mockResolvedValue({ id: 'sub-1' })

    const result = await syncRemnashopUsersToCabinet({ forceRemnawaveSubscriptions: true })

    expect(mocks.remnawave.getUserByUuid).toHaveBeenCalledWith('rw-1')
    expect(mocks.upsertLocalSubscriptionFromRemnawave).toHaveBeenCalled()
    expect(result.subscriptionsSynced).toBe(1)
    expect(result.subscriptionsSkipped).toBe(0)
  })

  it('syncs current cabinet user from Remnashop on login by local identity', async () => {
    mocks.prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'telegram-123@pending.invalid',
        name: 'Егор',
        remnashopUserId: 10,
        remnawaveUuid: null,
        remnawaveUsername: null,
        telegramId: 123n,
        telegramUsername: 'egor',
        telegramLinkedAt: new Date('2026-06-20T00:00:00.000Z'),
        emailVerifiedAt: null,
        subscriptions: [],
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'telegram-123@pending.invalid',
        name: 'Егор',
        remnashopUserId: 10,
        remnawaveUuid: null,
        remnawaveUsername: null,
        telegramId: 123n,
        telegramUsername: 'egor',
        telegramLinkedAt: new Date('2026-06-20T00:00:00.000Z'),
        emailVerifiedAt: null,
        subscriptions: [],
      })
    mocks.remnashopQuery.mockResolvedValue({ rows: [sourceUser] })
    mocks.prisma.user.update.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: null,
      remnawaveUsername: null,
      subscriptions: [],
    })
    mocks.remnawave.getUserByUuid.mockResolvedValue({ response: remnawaveUser })
    mocks.remnawave.updateUser.mockResolvedValue({ response: { ...remnawaveUser, telegramId: 123 } })
    mocks.upsertLocalSubscriptionFromRemnawave.mockResolvedValue({ id: 'sub-1' })

    const result = await syncRemnashopUserToCabinet('user-1')

    expect(result.found).toBe(true)
    expect(mocks.remnashopQuery.mock.calls[0]?.[0]).toContain('WHERE u.id = $1')
    expect(mocks.upsertLocalSubscriptionFromRemnawave).toHaveBeenCalledWith(
      expect.objectContaining({
        localUserId: 'user-1',
        remnashopUserId: 10,
      })
    )
  })
})
