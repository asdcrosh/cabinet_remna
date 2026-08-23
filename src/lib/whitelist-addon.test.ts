import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    payment: { findUnique: vi.fn(), update: vi.fn() },
    subscription: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  }
  const remnawave = { updateUser: vi.fn() }
  return { prisma, remnawave }
})

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./remnawave', () => ({
  remnawave: mocks.remnawave,
  hasRemnawaveUserReference: (user: any) => Boolean(user.remnawaveUuid),
  remnawaveUserReference: (user: any) => ({ uuid: user.remnawaveUuid }),
}))

import {
  buildWhitelistAddonSnapshot,
  grantWhitelistAddonManually,
  provisionWhitelistAddon,
  reconcileExpiredWhitelistAddons,
  revokeWhitelistAddonManually,
  revokeWhitelistAddonForPayment,
} from './whitelist-addon'

describe('whitelist add-on', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma))
    mocks.prisma.auditLog.create.mockResolvedValue({})
  })

  it('adds paid squads without extending the subscription', async () => {
    const paidAt = new Date('2026-08-01T12:00:00.000Z')
    const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const subscription = {
      id: 'subscription-1',
      userId: 'user-1',
      planId: 'plan-1',
      status: 'ACTIVE',
      expireAt,
      whitelistAddonActive: false,
    }
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
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
      user: { id: 'user-1', remnawaveUuid: 'rw-1' },
      plan: { id: 'plan-1', activeInternalSquads: ['base-squad'] },
    })
    mocks.remnawave.updateUser.mockResolvedValue({ response: { uuid: 'rw-1' } })
    mocks.prisma.subscription.update.mockResolvedValue({
      ...subscription,
      whitelistAddonActive: true,
    })

    const result = await provisionWhitelistAddon('payment-1')

    expect(mocks.remnawave.updateUser).toHaveBeenCalledWith(
      { uuid: 'rw-1' },
      { activeInternalSquads: ['base-squad', 'addon-squad'] }
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
  })

  it('does not grant the add-on after the subscription expires', async () => {
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

    await expect(provisionWhitelistAddon('payment-1')).rejects.toThrow('Подписка завершилась')
    expect(mocks.remnawave.updateUser).not.toHaveBeenCalled()
  })

  it('adds 30 days to the current add-on expiry when renewed early', async () => {
    const paidAt = new Date('2026-08-20T12:00:00.000Z')
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

  it('removes paid squads after a full refund', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      purchaseType: 'WHITELIST_ADDON',
      subscription: {
        id: 'subscription-1',
        whitelistAddonActive: true,
        whitelistAddonPaymentId: 'payment-1',
        plan: { activeInternalSquads: ['current-base-squad'] },
      },
      user: { id: 'user-1', remnawaveUuid: 'rw-1' },
      plan: { activeInternalSquads: ['base-squad'] },
    })
    mocks.remnawave.updateUser.mockResolvedValue({ response: { uuid: 'rw-1' } })
    mocks.prisma.subscription.update.mockResolvedValue({})

    await expect(revokeWhitelistAddonForPayment('payment-1')).resolves.toEqual({ revoked: true })
    expect(mocks.remnawave.updateUser).toHaveBeenCalledWith(
      { uuid: 'rw-1' },
      { activeInternalSquads: ['current-base-squad'] }
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
})
