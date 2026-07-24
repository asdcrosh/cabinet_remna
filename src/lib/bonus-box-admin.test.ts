import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    bonusBoxOpening: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
  },
}))

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))

import { bonusBoxHistoryWhere, getBonusBoxAdminAnalytics } from './bonus-box-admin'

describe('bonus-box admin analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-24T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('attributes a payment made within seven days after an opening', async () => {
    mocks.prisma.bonusBoxOpening.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        createdAt: new Date('2026-07-20T12:00:00.000Z'),
        expectedChance: 0.5,
        expectedDistribution: [
          { prizeId: 'prize-1', title: 'Два открытия', probability: 0.5 },
          { prizeId: 'prize-2', title: 'Промокод', probability: 0.5 },
        ],
        prize: {
          id: 'prize-1',
          title: 'Два открытия',
          type: 'BONUS_ATTEMPTS',
          estimatedCostKopecks: 1000,
        },
      },
    ])
    mocks.prisma.payment.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        amountKopecks: 30_000,
        paidAt: new Date('2026-07-22T12:00:00.000Z'),
      },
    ])

    const analytics = await getBonusBoxAdminAnalytics()

    expect(analytics.convertedUsers).toBe(1)
    expect(analytics.attributedRevenueKopecks).toBe(30_000)
    expect(analytics.estimatedCostKopecks).toBe(1000)
    expect(analytics.roiPercent).toBe(2900)
    expect(analytics.distribution).toEqual(expect.arrayContaining([
      expect.objectContaining({
        prizeId: 'prize-1',
        actual: 1,
        expected: 0.5,
      }),
      expect.objectContaining({
        prizeId: 'prize-2',
        actual: 0,
        expected: 0.5,
      }),
    ]))
  })

  it('builds combined history filters', () => {
    const where = bonusBoxHistoryWhere({
      q: 'alex',
      prizeId: 'prize-1',
      sync: 'pending',
      from: '2026-07-01',
      to: '2026-07-24',
    })

    expect(where).toMatchObject({
      prizeId: 'prize-1',
      remoteSynced: false,
      user: {
        OR: [
          { email: { contains: 'alex', mode: 'insensitive' } },
          { name: { contains: 'alex', mode: 'insensitive' } },
        ],
      },
    })
  })
})
