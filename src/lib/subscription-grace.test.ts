import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  auditCreate: vi.fn(),
  auditCreateMany: vi.fn(),
  updateUser: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    subscription: {
      findMany: mocks.findMany,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
    auditLog: {
      create: mocks.auditCreate,
      createMany: mocks.auditCreateMany,
    },
  },
}))
vi.mock('./remnawave', () => ({
  hasRemnawaveUserReference: (user: { remnawaveUuid?: string | null }) => Boolean(user.remnawaveUuid),
  remnawaveUserReference: (user: { remnawaveUuid: string }) => ({ uuid: user.remnawaveUuid }),
  remnawave: { updateUser: mocks.updateUser },
}))
vi.mock('./logger', () => ({ logError: mocks.logError }))

import { reconcileSubscriptionGracePeriods } from './subscription-grace'

describe('subscription grace reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.update.mockResolvedValue({})
    mocks.updateMany.mockResolvedValue({ count: 0 })
    mocks.auditCreate.mockResolvedValue({})
    mocks.auditCreateMany.mockResolvedValue({ count: 0 })
    mocks.updateUser.mockResolvedValue({})
  })

  it('starts a 24-hour grace period from the paid expiration time', async () => {
    const now = new Date('2026-08-23T12:00:00.000Z')
    const expireAt = new Date('2026-08-23T11:00:00.000Z')
    const graceExpireAt = new Date('2026-08-24T11:00:00.000Z')
    mocks.findMany
      .mockResolvedValueOnce([{
        id: 'subscription-1',
        userId: 'user-1',
        expireAt,
        user: { remnawaveUuid: 'remna-1' },
      }])
      .mockResolvedValueOnce([])

    await expect(reconcileSubscriptionGracePeriods({ now })).resolves.toEqual({
      checked: 1,
      started: 1,
      expired: 0,
      failed: 0,
    })
    expect(mocks.updateUser).toHaveBeenCalledWith(
      { uuid: 'remna-1' },
      { expireAt: graceExpireAt.toISOString(), status: 'ACTIVE' }
    )
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'subscription-1' },
      data: { graceStartedAt: now, graceExpireAt, status: 'LIMITED' },
    })
  })

  it('expires an ended grace period only once', async () => {
    const now = new Date('2026-08-24T12:00:00.000Z')
    mocks.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'subscription-1', userId: 'user-1' }])
    mocks.updateMany.mockResolvedValue({ count: 1 })
    mocks.auditCreateMany.mockResolvedValue({ count: 1 })

    await expect(reconcileSubscriptionGracePeriods({ now })).resolves.toEqual({
      checked: 0,
      started: 0,
      expired: 1,
      failed: 0,
    })
    expect(mocks.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ status: { not: 'EXPIRED' } }),
    }))
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['subscription-1'] },
        status: { not: 'EXPIRED' },
      },
      data: { status: 'EXPIRED' },
    })
  })
})
