import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    payment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (fn) => fn(prisma)),
  }

  const remnawave = {
    createUser: vi.fn(),
    updateUser: vi.fn(),
    resetTraffic: vi.fn(),
  }

  return { prisma, remnawave }
})

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./remnawave', () => ({
  remnawave: mocks.remnawave,
  RemnawaveError: class RemnawaveError extends Error {
    constructor(public status: number, public body: unknown, message: string) {
      super(message)
      this.name = 'RemnawaveError'
    }
  },
}))

import { ensureRemnawaveSubscription } from './subscription'
import { RemnawaveError } from './remnawave'

const plan = {
  id: 'plan-1',
  name: 'Базовый',
  durationDays: 30,
  trafficLimitGb: 200,
  deviceLimit: 5,
}

const remnawaveUser = {
  uuid: 'rw-1',
  shortUuid: 'short-1',
  username: 'user_1',
  status: 'ACTIVE' as const,
  usedTrafficBytes: '0',
  lifetimeUsedTrafficBytes: '0',
  trafficLimitBytes: '214748364800',
  trafficLimitStrategy: 'MONTH' as const,
  expireAt: '2026-02-14T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  vlessUuid: 'vless',
  trojanPassword: 'trojan',
  ssPassword: 'ss',
}

describe('ensureRemnawaveSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    process.env.REMNAWAVE_INTERNAL_SQUAD_UUIDS = 'squad-1,squad-2'
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.REMNAWAVE_INTERNAL_SQUAD_UUIDS
    delete process.env.REMNAWAVE_INTERNAL_SQUAD_UUID
  })

  it('short-circuits when payment is already provisioned', async () => {
    const subscription = {
      id: 'sub-1',
      userId: 'user-1',
      planId: 'plan-1',
      startAt: new Date(),
      expireAt: new Date(),
      status: 'ACTIVE',
      trafficLimitBytes: null,
      trafficUsedBytes: 0n,
      lifetimeUsedBytes: 0n,
      lastSyncedAt: new Date(),
      pendingSync: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'pay-1',
      subscriptionProvisionedAt: new Date(),
      subscription,
    })

    const result = await ensureRemnawaveSubscription({
      userId: 'user-1',
      email: 'user@example.com',
      paymentId: 'pay-1',
      plan,
    })

    expect(result.idempotent).toBe(true)
    expect(result.subscription).toBe(subscription)
    expect(mocks.remnawave.createUser).not.toHaveBeenCalled()
    expect(mocks.remnawave.updateUser).not.toHaveBeenCalled()
  })

  it('extends existing Remnawave user from current active expireAt', async () => {
    const currentExpireAt = new Date('2026-01-15T00:00:00.000Z')
    mocks.prisma.payment.findUnique.mockResolvedValue(null)
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      remnawaveUuid: 'rw-1',
      subscriptions: [{ id: 'sub-1', planId: 'plan-1', expireAt: currentExpireAt, status: 'ACTIVE' }],
    })
    mocks.remnawave.updateUser.mockResolvedValue({ response: remnawaveUser })
    mocks.prisma.subscription.update.mockResolvedValue({ id: 'sub-1' })

    await ensureRemnawaveSubscription({
      userId: 'user-1',
      email: 'user@example.com',
      plan,
    })

    expect(mocks.remnawave.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: 'rw-1',
        expireAt: new Date('2026-02-14T00:00:00.000Z').toISOString(),
        hwidDeviceLimit: 5,
        tag: 'IMPORTED',
        activeInternalSquads: ['squad-1', 'squad-2'],
      })
    )
    expect(mocks.prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ planId: 'plan-1' }),
      })
    )
  })

  it('starts a fresh period when switching to another plan', async () => {
    const currentExpireAt = new Date('2026-03-01T00:00:00.000Z')
    mocks.prisma.payment.findUnique.mockResolvedValue(null)
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      remnawaveUuid: 'rw-1',
      subscriptions: [{ id: 'sub-1', planId: 'old-plan', expireAt: currentExpireAt, status: 'ACTIVE' }],
    })
    mocks.remnawave.updateUser.mockResolvedValue({ response: remnawaveUser })
    mocks.prisma.subscription.update.mockResolvedValue({ id: 'sub-1' })

    await ensureRemnawaveSubscription({
      userId: 'user-1',
      email: 'user@example.com',
      plan,
    })

    expect(mocks.remnawave.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: 'rw-1',
        expireAt: new Date('2026-01-31T00:00:00.000Z').toISOString(),
      })
    )
    expect(mocks.prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({
          planId: 'plan-1',
          startAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      })
    )
  })

  it('replaces the current period and resets traffic when requested by admin', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue(null)
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      remnawaveUuid: 'rw-1',
      subscriptions: [{ id: 'sub-1', planId: 'plan-1', expireAt: new Date('2026-03-01T00:00:00.000Z'), status: 'ACTIVE' }],
    })
    mocks.remnawave.updateUser.mockResolvedValue({ response: remnawaveUser })
    mocks.remnawave.resetTraffic.mockResolvedValue({ response: remnawaveUser })
    mocks.prisma.subscription.update.mockResolvedValue({ id: 'sub-1' })

    await ensureRemnawaveSubscription({
      userId: 'user-1',
      email: 'user@example.com',
      plan,
      periodMode: 'REPLACE',
    })

    expect(mocks.remnawave.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        expireAt: new Date('2026-01-31T00:00:00.000Z').toISOString(),
      })
    )
    expect(mocks.remnawave.resetTraffic).toHaveBeenCalledWith('rw-1')
  })

  it('uses plan squads before env fallback', async () => {
    const currentExpireAt = new Date('2026-01-15T00:00:00.000Z')
    mocks.prisma.payment.findUnique.mockResolvedValue(null)
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      remnawaveUuid: 'rw-1',
      subscriptions: [{ id: 'sub-1', planId: 'plan-1', expireAt: currentExpireAt, status: 'ACTIVE' }],
    })
    mocks.remnawave.updateUser.mockResolvedValue({ response: remnawaveUser })
    mocks.prisma.subscription.update.mockResolvedValue({ id: 'sub-1' })

    await ensureRemnawaveSubscription({
      userId: 'user-1',
      email: 'user@example.com',
      plan: {
        ...plan,
        activeInternalSquads: ['plan-squad-1', 'plan-squad-2'],
      },
    })

    expect(mocks.remnawave.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        activeInternalSquads: ['plan-squad-1', 'plan-squad-2'],
      })
    )
  })

  it('sends Telegram ID when creating a new Remnawave user', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue(null)
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      telegramId: 8507156675n,
      remnawaveUuid: null,
      subscriptions: [],
    })
    mocks.remnawave.createUser.mockResolvedValue({ response: remnawaveUser })
    mocks.prisma.user.update.mockResolvedValue({})
    mocks.prisma.subscription.create.mockResolvedValue({ id: 'sub-1' })

    await ensureRemnawaveSubscription({
      userId: 'user-1',
      email: 'user@example.com',
      plan,
    })

    expect(mocks.remnawave.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        telegramId: 8507156675,
      })
    )
  })

  it('recreates Remnawave user when local profile was deleted remotely', async () => {
    const currentExpireAt = new Date('2026-01-15T00:00:00.000Z')
    mocks.prisma.payment.findUnique.mockResolvedValue(null)
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      remnawaveUuid: 'deleted-rw-1',
      subscriptions: [{ id: 'sub-1', planId: 'plan-1', expireAt: currentExpireAt, status: 'ACTIVE' }],
    })
    mocks.remnawave.updateUser.mockRejectedValue(new RemnawaveError(404, { errorCode: 'A025' }, 'User not found'))
    mocks.remnawave.createUser.mockResolvedValue({ response: remnawaveUser })
    mocks.prisma.user.update.mockResolvedValue({})
    mocks.prisma.subscription.update.mockResolvedValue({ id: 'sub-1' })

    await ensureRemnawaveSubscription({
      userId: 'user-1',
      email: 'user@example.com',
      plan,
    })

    expect(mocks.remnawave.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        expireAt: new Date('2026-02-14T00:00:00.000Z').toISOString(),
        tag: 'IMPORTED',
        activeInternalSquads: ['squad-1', 'squad-2'],
      })
    )
    expect(mocks.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ remnawaveUuid: 'rw-1', remnawaveUsername: 'user_1' }),
      })
    )
  })
})
