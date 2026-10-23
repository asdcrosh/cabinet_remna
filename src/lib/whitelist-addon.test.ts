import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    payment: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    subscription: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  }
  const remnawave = { updateUser: vi.fn(), getUser: vi.fn() }
  return { prisma, remnawave }
})

vi.mock('./distributed-lock', () => ({
  withDistributedLock: async (_key: string, task: () => Promise<unknown>) => ({ acquired: true, value: await task() }),
}))

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./remnashop-users', () => ({ syncRemnashopUserBySourceId: vi.fn() }))
vi.mock('./payment-providers', () => ({
  getAvailablePaymentProviders: async () => [{ id: 'YOOKASSA' }, { id: 'PLATEGA' }],
}))
vi.mock('./remnawave', () => ({
  remnawave: mocks.remnawave,
  hasRemnawaveUserReference: (user: any) => Boolean(user.remnawaveUuid),
  remnawaveUserReference: (user: any) => ({ uuid: user.remnawaveUuid }),
}))

import {
  buildWhitelistAddonSnapshot,
  grantWhitelistAddonManually,
  provisionWhitelistAddon,
  reconcileAvailableSubscriptionWhitelistAddons,
  reconcileExpiredWhitelistAddons,
  reconcileUnavailableSubscriptionWhitelistAddons,
  revokeWhitelistAddonManually,
  revokeWhitelistAddonForPayment,
} from './whitelist-addon'
import { getBotWhitelistOffer } from './bot-whitelist'

describe('whitelist add-on', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.remnawave.getUser.mockImplementation(async () => ({ response: {
      status: 'ACTIVE', expireAt: new Date(Date.now() + 86400_000).toISOString(), activeInternalSquads: [{ uuid: 'base-squad' }],
    } }))
    mocks.prisma.subscription.findUnique.mockImplementation(async () => (await mocks.prisma.subscription.findMany())[0])
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma))
    mocks.prisma.auditLog.create.mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(['YOOKASSA', 'PLATEGA'])('fulfills %s, hides the offer and preserves the primary subscription on replay', async (provider) => {
    const paidAt = new Date('2026-08-01T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(paidAt)
    const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const subscription = {
      id: 'subscription-1',
      userId: 'user-1',
      planId: 'plan-1',
      status: 'ACTIVE',
      startAt: new Date('2026-07-01T12:00:00.000Z'),
      expireAt,
      deviceLimit: 5,
      trafficLimitBytes: 200n * 1024n ** 3n,
      trafficUsedBytes: 123456n,
      lifetimeUsedBytes: 654321n,
      whitelistAddonActive: false,
      plan: {
        id: 'plan-1', activeInternalSquads: ['base-squad'], whitelistAddonEnabled: true,
        whitelistAddonPriceKopecks: 20000, whitelistAddonInternalSquads: ['addon-squad'],
      },
    }
    const primaryBefore = structuredClone(subscription)
    const user = { id: 'user-1', remnawaveUuid: 'rw-1' }
    const remote = {
      uuid: 'rw-1', status: 'ACTIVE', expireAt: expireAt.toISOString(),
      hwidDeviceLimit: 5, trafficLimitBytes: 214748364800,
      subscriptionUrl: 'https://subscription.test/existing-key',
      activeInternalSquads: [{ uuid: 'base-squad' }, { uuid: 'manual-squad' }],
    }
    const remoteBefore = structuredClone(remote)
    const payment = {
      id: 'payment-1',
      provider,
      status: 'SUCCEEDED',
      userId: 'user-1',
      planId: 'plan-1',
      purchaseType: 'WHITELIST_ADDON',
      paidAt,
      subscriptionProvisionedAt: null,
      addonSnapshot: buildWhitelistAddonSnapshot({
        planId: 'plan-1',
        subscriptionId: subscription.id,
        subscriptionExpireAt: expireAt,
        priceKopecks: 20000,
        internalSquads: ['addon-squad'],
      }),
      subscription,
      user,
      plan: subscription.plan,
    }
    mocks.prisma.payment.findUnique.mockImplementation(async () => payment)
    mocks.prisma.payment.findFirst.mockResolvedValue(null)
    mocks.prisma.payment.update.mockImplementation(async ({ data }) => Object.assign(payment, data))
    mocks.prisma.subscription.findMany.mockImplementation(async () => [subscription])
    mocks.prisma.subscription.findFirst.mockImplementation(async ({ where }) => where.id ? null : subscription)
    mocks.prisma.subscription.update.mockImplementation(async ({ data }) => Object.assign(subscription, data))
    mocks.remnawave.getUser.mockImplementation(async () => ({ response: remote }))
    mocks.remnawave.updateUser.mockImplementation(async (_reference, data) => {
      Object.assign(remote, data, { activeInternalSquads: data.activeInternalSquads.map((uuid: string) => ({ uuid })) })
      return { response: remote }
    })

    expect((await getBotWhitelistOffer(user as never)).available).toBe(true)

    const result = await provisionWhitelistAddon('payment-1')

    expect(mocks.remnawave.updateUser).toHaveBeenCalledWith(
      { uuid: 'rw-1' },
      { activeInternalSquads: ['base-squad', 'manual-squad', 'addon-squad'] }
    )
    expect(mocks.prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: subscription.id },
      data: expect.objectContaining({
        whitelistAddonActive: true,
        whitelistAddonActivatedAt: paidAt,
        whitelistAddonExpireAt: new Date('2026-08-31T12:00:00.000Z'),
        whitelistAddonPaymentId: 'payment-1',
      }),
    })
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: expect.objectContaining({ subscriptionProvisionedAt: expect.any(Date) }),
    })
    expect(result.subscription.whitelistAddonActive).toBe(true)
    expect((await getBotWhitelistOffer(user as never)).available).toBe(false)
    expect(subscription).toMatchObject({ ...primaryBefore, whitelistAddonActive: true })
    expect(remote).toEqual({
      ...remoteBefore,
      activeInternalSquads: [...remoteBefore.activeInternalSquads, { uuid: 'addon-squad' }],
    })
    for (const [{ data }] of mocks.prisma.subscription.update.mock.calls) {
      expect(Object.keys(data).filter((key) => !key.startsWith('whitelistAddon') && key !== 'lastSyncedAt')).toEqual([])
    }
    const afterFirst = structuredClone(subscription)
    expect((await provisionWhitelistAddon('payment-1')).idempotent).toBe(true)
    expect(subscription).toEqual(afterFirst)
    expect(mocks.remnawave.updateUser).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.subscription.update).toHaveBeenCalledTimes(1)
  })

  it('saves the paid 30 days on pause when the main subscription expires during payment', async () => {
    const expireAt = new Date(Date.now() - 1000)
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      planId: 'plan-1',
      purchaseType: 'WHITELIST_ADDON',
      subscriptionProvisionedAt: null,
      addonSnapshot: buildWhitelistAddonSnapshot({
        planId: 'plan-1',
        subscriptionId: 'subscription-1',
        subscriptionExpireAt: expireAt,
        priceKopecks: 20000,
        internalSquads: ['addon-squad'],
      }),
      subscription: {
        id: 'subscription-1',
        userId: 'user-1',
        planId: 'plan-1',
        status: 'EXPIRED',
        expireAt,
      },
      user: { id: 'user-1', remnawaveUuid: 'rw-1' },
      plan: { id: 'plan-1', activeInternalSquads: ['base-squad'] },
    })

    mocks.remnawave.getUser.mockResolvedValue({ response: { status: 'EXPIRED', expireAt: expireAt.toISOString() } })
    mocks.prisma.subscription.update.mockResolvedValue({ id: 'subscription-1', whitelistAddonActive: false })
    await provisionWhitelistAddon('payment-1')
    expect(mocks.prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ whitelistAddonRemainingSeconds: 30n * 86400n, whitelistAddonActive: false }),
    }))
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ subscriptionProvisionedAt: expect.any(Date) }),
    }))
    expect(mocks.remnawave.updateUser).not.toHaveBeenCalled()
  })

  it('adds 30 days to the current add-on expiry when renewed early', async () => {
    const paidAt = new Date('2026-08-20T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(paidAt)
    const addonExpireAt = new Date('2026-08-23T12:00:00.000Z')
    const subscriptionExpireAt = new Date('2026-10-01T12:00:00.000Z')
    const subscription = {
      id: 'subscription-1',
      userId: 'user-1',
      planId: 'plan-1',
      status: 'ACTIVE',
      expireAt: subscriptionExpireAt,
      whitelistAddonActive: true,
      whitelistAddonExpireAt: addonExpireAt,
    }
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-renewal',
      userId: 'user-1',
      planId: 'plan-1',
      purchaseType: 'WHITELIST_ADDON',
      paidAt,
      subscriptionProvisionedAt: null,
      addonSnapshot: buildWhitelistAddonSnapshot({
        planId: 'plan-1',
        subscriptionId: subscription.id,
        subscriptionExpireAt,
        priceKopecks: 20000,
        internalSquads: ['addon-squad'],
      }),
      subscription,
      user: { id: 'user-1', remnawaveUuid: 'rw-1' },
      plan: { id: 'plan-1', activeInternalSquads: ['base-squad'] },
    })
    mocks.remnawave.updateUser.mockResolvedValue({ response: { uuid: 'rw-1' } })
    mocks.prisma.subscription.update.mockResolvedValue(subscription)

    await provisionWhitelistAddon('payment-renewal')

    expect(mocks.prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: subscription.id },
      data: expect.objectContaining({
        whitelistAddonActivatedAt: paidAt,
        whitelistAddonExpireAt: new Date('2026-09-22T12:00:00.000Z'),
        whitelistAddonPaymentId: 'payment-renewal',
      }),
    })
  })

  it('adds a standalone purchase after a paused balance from an older subscription', async () => {
    const paidAt = new Date('2026-09-01T00:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(paidAt)
    const subscription = {
      id: 'subscription-2',
      userId: 'user-1',
      planId: 'plan-1',
      status: 'ACTIVE',
      expireAt: new Date('2026-10-01T00:00:00.000Z'),
      whitelistAddonActive: false,
      whitelistAddonRemainingSeconds: null,
    }
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-2',
      userId: 'user-1',
      planId: 'plan-1',
      purchaseType: 'WHITELIST_ADDON',
      paidAt,
      subscriptionProvisionedAt: null,
      addonSnapshot: buildWhitelistAddonSnapshot({
        planId: 'plan-1',
        subscriptionId: subscription.id,
        subscriptionExpireAt: subscription.expireAt,
        priceKopecks: 20000,
        internalSquads: ['addon-squad'],
      }),
      subscription,
      user: { id: 'user-1', remnawaveUuid: 'rw-1' },
      plan: { id: 'plan-1', activeInternalSquads: ['base-squad'] },
    })
    mocks.prisma.subscription.findFirst.mockResolvedValueOnce(subscription).mockResolvedValue({
      id: 'subscription-1',
      whitelistAddonRemainingSeconds: 20n * 24n * 60n * 60n,
    })
    mocks.remnawave.updateUser.mockResolvedValue({ response: { uuid: 'rw-1' } })
    mocks.prisma.subscription.update.mockResolvedValue({})

    await provisionWhitelistAddon('payment-2')

    expect(mocks.prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'subscription-2' },
      data: expect.objectContaining({
        whitelistAddonExpireAt: new Date('2026-10-21T00:00:00.000Z'),
      }),
    }))
    expect(mocks.prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'subscription-1' },
      data: expect.objectContaining({ whitelistAddonRemainingSeconds: null }),
    }))
  })

  it.each([
    { paused: false, totalDays: 20, rewardDays: 7, expectedDays: 7 },
    { paused: false, totalDays: 3, rewardDays: 7, expectedDays: 3 },
    { paused: true, totalDays: 20, rewardDays: 7, expectedDays: 7 },
  ])('preserves unused roulette rewards after a refund: %j', async ({ paused, totalDays, rewardDays, expectedDays }) => {
    vi.useFakeTimers()
    const now = new Date('2026-10-23T12:00:00Z')
    vi.setSystemTime(now)
    const subscription = {
      id: 'subscription-1', userId: 'user-1', status: paused ? 'EXPIRED' : 'ACTIVE',
      expireAt: new Date(+now + (paused ? -1 : 60) * 86400_000),
      whitelistAddonActive: !paused,
      whitelistAddonExpireAt: paused ? null : new Date(+now + totalDays * 86400_000),
      whitelistAddonRemainingSeconds: paused ? BigInt(totalDays) * 86400n : null,
      whitelistAddonPaymentId: 'payment-1', whitelistAddonInternalSquads: ['paid-squad', 'reward-squad'],
      whitelistAddonRewardSeconds: BigInt(rewardDays) * 86400n, whitelistAddonRewardSquads: ['reward-squad'],
      plan: { activeInternalSquads: ['base-squad'] },
    }
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1', userId: 'user-1', purchaseType: 'WHITELIST_ADDON', subscription,
      user: { id: 'user-1', remnawaveUuid: 'rw-1' }, plan: { activeInternalSquads: ['base-squad'] },
    })
    mocks.prisma.subscription.update.mockImplementation(async ({ data }) => Object.assign(subscription, data))
    mocks.remnawave.getUser.mockResolvedValue({ response: { activeInternalSquads: [
      { uuid: 'base-squad' }, { uuid: 'paid-squad' }, { uuid: 'reward-squad' }, { uuid: 'manual-squad' },
    ] } })
    mocks.remnawave.updateUser.mockResolvedValue({ response: {} })
    expect(await revokeWhitelistAddonForPayment('payment-1')).toMatchObject({ revoked: true })
    expect(subscription).toMatchObject({
      whitelistAddonActive: !paused, whitelistAddonPaymentId: null,
      whitelistAddonExpireAt: paused ? null : new Date(+now + expectedDays * 86400_000),
      whitelistAddonRemainingSeconds: paused ? BigInt(expectedDays) * 86400n : null,
      whitelistAddonRewardSeconds: BigInt(expectedDays) * 86400n,
      whitelistAddonInternalSquads: ['reward-squad'],
    })
    expect(mocks.remnawave.updateUser).toHaveBeenCalledWith(expect.anything(), {
      activeInternalSquads: paused ? ['base-squad', 'manual-squad'] : ['base-squad', 'manual-squad', 'reward-squad'],
    })
    // Repeated refund webhooks must not touch the retained prize.
    expect(await revokeWhitelistAddonForPayment('payment-1')).toEqual({ revoked: false })
    expect(mocks.remnawave.updateUser).toHaveBeenCalledTimes(1)
  })

  it('adds a paid month after a prize without losing reward squads or refund accounting', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-10-23T12:00:00Z')
    vi.setSystemTime(now)
    const subscription = {
      id: 'subscription-1', userId: 'user-1', status: 'ACTIVE', expireAt: new Date(+now + 90 * 86400_000),
      whitelistAddonActive: true, whitelistAddonExpireAt: new Date(+now + 7 * 86400_000),
      whitelistAddonInternalSquads: ['reward-squad'],
      whitelistAddonRewardSeconds: 7n * 86400n, whitelistAddonRewardSquads: ['reward-squad'],
      plan: { activeInternalSquads: ['base-squad'] },
    }
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-new', userId: 'user-1', purchaseType: 'WHITELIST_ADDON', subscription,
      addonSnapshot: buildWhitelistAddonSnapshot({ planId: 'plan-1', subscriptionId: subscription.id,
        subscriptionExpireAt: subscription.expireAt, priceKopecks: 20000, internalSquads: ['paid-squad'] }),
      user: { id: 'user-1', remnawaveUuid: 'rw-1' }, plan: subscription.plan,
    })
    mocks.prisma.subscription.findFirst.mockResolvedValue(subscription)
    mocks.prisma.subscription.update.mockImplementation(async ({ data }) => Object.assign(subscription, data))
    mocks.remnawave.updateUser.mockResolvedValue({ response: {} })
    await provisionWhitelistAddon('payment-new')
    expect(subscription).toMatchObject({
      whitelistAddonExpireAt: new Date(+now + 37 * 86400_000), whitelistAddonPaymentId: 'payment-new',
      whitelistAddonRewardSeconds: 7n * 86400n, whitelistAddonRewardSquads: ['reward-squad'],
      whitelistAddonInternalSquads: ['paid-squad', 'reward-squad'],
    })
    expect(mocks.remnawave.updateUser).toHaveBeenLastCalledWith(expect.anything(), {
      activeInternalSquads: ['base-squad', 'paid-squad', 'reward-squad'],
    })
  })

  it('removes paid squads after a full refund', async () => {
    mocks.remnawave.getUser.mockResolvedValue({ response: { activeInternalSquads: [{ uuid: 'current-base-squad' }, { uuid: 'addon-squad' }, { uuid: 'manual-squad' }] } })
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      purchaseType: 'WHITELIST_ADDON',
      subscription: {
        id: 'subscription-1',
        whitelistAddonActive: true,
        whitelistAddonPaymentId: 'payment-1',
        plan: { activeInternalSquads: ['current-base-squad'] },
        whitelistAddonInternalSquads: ['addon-squad'],
      },
      user: { id: 'user-1', remnawaveUuid: 'rw-1' },
      plan: { activeInternalSquads: ['base-squad'] },
    })
    mocks.remnawave.updateUser.mockResolvedValue({ response: { uuid: 'rw-1' } })
    mocks.prisma.subscription.update.mockResolvedValue({})

    await expect(revokeWhitelistAddonForPayment('payment-1')).resolves.toEqual({ revoked: true })
    expect(mocks.remnawave.updateUser).toHaveBeenCalledWith(
      { uuid: 'rw-1' },
      { activeInternalSquads: ['current-base-squad', 'manual-squad'] }
    )
    expect(mocks.prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'subscription-1' },
      data: expect.objectContaining({
        whitelistAddonActive: false,
        whitelistAddonActivatedAt: null,
        whitelistAddonExpireAt: null,
        whitelistAddonPaymentId: null,
      }),
    })
  })

  it('revokes a paused balance after it was moved to a newer subscription', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      purchaseType: 'WHITELIST_ADDON',
      subscription: {
        id: 'old-subscription',
        whitelistAddonActive: false,
        whitelistAddonRemainingSeconds: null,
        whitelistAddonPaymentId: null,
        plan: { activeInternalSquads: ['old-base-squad'] },
      },
      user: { id: 'user-1', remnawaveUuid: 'rw-1' },
      plan: { activeInternalSquads: ['base-squad'] },
    })
    mocks.prisma.subscription.findFirst.mockResolvedValue({
      id: 'new-subscription',
      whitelistAddonActive: false,
      whitelistAddonRemainingSeconds: 20n * 24n * 60n * 60n,
      whitelistAddonPaymentId: 'payment-1',
      plan: { activeInternalSquads: ['current-base-squad'] },
    })
    mocks.remnawave.updateUser.mockResolvedValue({ response: { uuid: 'rw-1' } })
    mocks.prisma.subscription.update.mockResolvedValue({})

    await expect(revokeWhitelistAddonForPayment('payment-1')).resolves.toEqual({ revoked: true })
    expect(mocks.prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'new-subscription' },
      data: expect.objectContaining({ whitelistAddonRemainingSeconds: null }),
    }))
  })

  it('manually grants configured squads until the selected date', async () => {
    const expireAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    mocks.prisma.subscription.findFirst.mockResolvedValue({
      id: 'subscription-1',
      userId: 'user-1',
      status: 'ACTIVE',
      expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      user: { id: 'user-1', remnawaveUuid: 'rw-1' },
      plan: {
        activeInternalSquads: ['base-squad'],
        whitelistAddonInternalSquads: ['addon-squad'],
      },
    })
    mocks.remnawave.updateUser.mockResolvedValue({ response: { uuid: 'rw-1' } })
    mocks.prisma.subscription.update.mockResolvedValue({
      id: 'subscription-1',
      whitelistAddonActive: true,
      whitelistAddonExpireAt: expireAt,
    })

    await grantWhitelistAddonManually({ userId: 'user-1', expireAt })

    expect(mocks.remnawave.updateUser).toHaveBeenCalledWith(
      { uuid: 'rw-1' },
      { activeInternalSquads: ['base-squad', 'addon-squad'] }
    )
    expect(mocks.prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'subscription-1' },
      data: expect.objectContaining({
        whitelistAddonActive: true,
        whitelistAddonExpireAt: expireAt,
        whitelistAddonPaymentId: null,
      }),
    })
  })

  it('manually revokes squads and clears the selected date', async () => {
    mocks.prisma.subscription.findFirst.mockResolvedValue({
      id: 'subscription-1',
      whitelistAddonActive: true,
      user: { id: 'user-1', remnawaveUuid: 'rw-1' },
      plan: { activeInternalSquads: ['base-squad'] },
    })
    mocks.remnawave.updateUser.mockResolvedValue({ response: { uuid: 'rw-1' } })
    mocks.prisma.subscription.update.mockResolvedValue({ id: 'subscription-1' })

    await expect(revokeWhitelistAddonManually('user-1')).resolves.toEqual({
      revoked: true,
      subscription: { id: 'subscription-1' },
    })
    expect(mocks.remnawave.updateUser).toHaveBeenCalledWith(
      { uuid: 'rw-1' },
      { activeInternalSquads: ['base-squad'] }
    )
    expect(mocks.prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'subscription-1' },
      data: expect.objectContaining({
        whitelistAddonActive: false,
        whitelistAddonExpireAt: null,
      }),
    })
  })

  it('removes expired squads from Remnawave and deactivates the add-on', async () => {
    const expireAt = new Date(Date.now() - 1000)
    mocks.prisma.subscription.findMany.mockResolvedValue([{
      id: 'subscription-1',
      userId: 'user-1',
      status: 'ACTIVE', expireAt: new Date(Date.now() + 86400_000),
      whitelistAddonActive: true,
      whitelistAddonExpireAt: expireAt,
      user: { id: 'user-1', remnawaveUuid: 'rw-1' },
      plan: { activeInternalSquads: ['base-squad'] },
    }])
    mocks.prisma.subscription.updateMany.mockResolvedValue({ count: 1 })
    mocks.remnawave.updateUser.mockResolvedValue({ response: { uuid: 'rw-1' } })

    await expect(reconcileExpiredWhitelistAddons()).resolves.toEqual({
      checked: 1,
      revoked: 1,
      failed: 0,
    })
    expect(mocks.remnawave.updateUser).toHaveBeenCalledWith(
      { uuid: 'rw-1' },
      { activeInternalSquads: ['base-squad'] }
    )
    expect(mocks.prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'subscription-1',
        whitelistAddonActive: true,
      }),
      data: expect.objectContaining({ whitelistAddonActive: false }),
    })
  })

  it('pauses the unused add-on balance at the exact main subscription expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-11T00:00:00.000Z'))
    mocks.prisma.subscription.findMany.mockResolvedValue([{
      id: 'subscription-1',
      userId: 'user-1',
      status: 'ACTIVE',
      expireAt: new Date('2026-08-11T00:00:00.000Z'),
      graceExpireAt: null,
      whitelistAddonActive: true,
      whitelistAddonExpireAt: new Date('2026-09-01T00:00:00.000Z'),
      whitelistAddonPausedAt: null,
    }])
    mocks.prisma.subscription.updateMany.mockResolvedValue({ count: 1 })

    await expect(reconcileUnavailableSubscriptionWhitelistAddons()).resolves.toEqual({
      checked: 1,
      paused: 1,
      exhausted: 0,
      failed: 0,
    })
    expect(mocks.prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'subscription-1' }),
      data: expect.objectContaining({
        whitelistAddonActive: false,
        whitelistAddonExpireAt: null,
        whitelistAddonPausedAt: new Date('2026-08-11T00:00:00.000Z'),
        whitelistAddonRemainingSeconds: 21n * 24n * 60n * 60n,
      }),
    })
  })

  it('resumes a paused balance after the main subscription becomes active externally', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'))
    mocks.prisma.subscription.findMany.mockResolvedValue([{
      id: 'subscription-1',
      userId: 'user-1',
      status: 'ACTIVE',
      expireAt: new Date('2026-10-01T00:00:00.000Z'),
      whitelistAddonActive: false,
      whitelistAddonExpireAt: null,
      whitelistAddonRemainingSeconds: 20n * 24n * 60n * 60n,
      whitelistAddonInternalSquads: ['addon-squad'],
      user: { remnawaveUuid: 'rw-1' },
      plan: {
        activeInternalSquads: ['base-squad'],
        whitelistAddonInternalSquads: ['configured-addon-squad'],
      },
    }])
    mocks.prisma.subscription.updateMany.mockResolvedValue({ count: 1 })
    mocks.remnawave.updateUser.mockResolvedValue({ response: { uuid: 'rw-1' } })

    await expect(reconcileAvailableSubscriptionWhitelistAddons()).resolves.toEqual({
      checked: 1,
      resumed: 1,
      failed: 0,
    })
    expect(mocks.remnawave.updateUser).toHaveBeenCalledWith(
      { uuid: 'rw-1' },
      { activeInternalSquads: ['base-squad', 'addon-squad'] }
    )
    expect(mocks.prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'subscription-1' }),
      data: expect.objectContaining({
        whitelistAddonActive: true,
        whitelistAddonExpireAt: new Date('2026-09-21T00:00:00.000Z'),
        whitelistAddonRemainingSeconds: null,
      }),
    })
  })
  it('does not revoke a renewal that won the lock before the expiry worker', async () => {
    const candidate = { id: 'sub', userId: 'user-1', whitelistAddonActive: true, whitelistAddonExpireAt: new Date(0) }
    mocks.prisma.subscription.findMany.mockResolvedValue([candidate])
    mocks.prisma.subscription.findUnique.mockResolvedValue({ ...candidate, whitelistAddonExpireAt: new Date(Date.now() + 86400_000) })
    expect(await reconcileExpiredWhitelistAddons()).toEqual({ checked: 1, revoked: 0, failed: 0 })
    expect(mocks.remnawave.updateUser).not.toHaveBeenCalled()
  })

  it('does not add days twice when a successful payment is retried', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue({ purchaseType: 'WHITELIST_ADDON', subscriptionProvisionedAt: new Date(), subscription: { id: 'sub' } })
    expect((await provisionWhitelistAddon('paid')).idempotent).toBe(true)
    expect(mocks.remnawave.updateUser).not.toHaveBeenCalled()
    expect(mocks.prisma.subscription.update).not.toHaveBeenCalled()
  })

})
