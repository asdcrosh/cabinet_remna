import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BonusBoxPrize } from '@prisma/client'

const mocks = vi.hoisted(() => {
  const prisma = {
    bonusBoxMission: {
      findMany: vi.fn(),
    },
    bonusBoxMissionProgress: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    bonusBoxEvent: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    bonusBoxEventClaim: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    bonusBoxAttempt: {
      createMany: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    bonusBoxOpening: {
      findMany: vi.fn(),
    },
    bonusBoxPrize: {
      findMany: vi.fn(),
    },
    bonusBoxRiskSignal: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    payment: {
      findMany: vi.fn(),
    },
    referralReward: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  const notifyUser = vi.fn()
  return { prisma, notifyUser }
})

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./notifications', () => ({ notifyUser: mocks.notifyUser }))

import {
  applyActiveEventWeights,
  assessBonusBoxRisk,
  claimBonusBoxMission,
  grantActiveEventAttempts,
  refreshBonusBoxMissionProgress,
} from './bonus-box-engagement'

describe('bonus-box engagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-24T12:00:00.000Z'))
    mocks.prisma.$transaction.mockImplementation(async (fn) => fn(mocks.prisma))
    mocks.notifyUser.mockResolvedValue({ telegram: 'skipped', email: 'skipped' })
    mocks.prisma.payment.findMany.mockResolvedValue([])
    mocks.prisma.referralReward.findMany.mockResolvedValue([])
    mocks.prisma.bonusBoxMissionProgress.upsert.mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.TRUSTED_PROXY_HEADERS
  })

  it('grants seasonal attempts once through an atomic event claim', async () => {
    mocks.prisma.bonusBoxEvent.findMany.mockResolvedValue([{
      id: 'event-1',
      title: 'Летний сезон',
      startsAt: new Date('2026-07-01T00:00:00.000Z'),
      attemptsPerUser: 2,
      maxClaims: 100,
    }])
    mocks.prisma.bonusBoxEventClaim.findUnique.mockResolvedValue(null)
    mocks.prisma.bonusBoxEvent.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.bonusBoxEventClaim.create.mockResolvedValue({})
    mocks.prisma.bonusBoxAttempt.createMany.mockResolvedValue({ count: 2 })

    const granted = await grantActiveEventAttempts('user-1')

    expect(granted).toBe(2)
    expect(mocks.prisma.bonusBoxAttempt.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ source: 'SEASONAL_EVENT', sourceKey: 'event:event-1:1' }),
        expect.objectContaining({ source: 'SEASONAL_EVENT', sourceKey: 'event:event-1:2' }),
      ],
      skipDuplicates: true,
    })
  })

  it('claims a completed mission exactly once', async () => {
    const mission = {
      id: 'mission-1',
      title: 'Первая оплата',
      description: null,
      type: 'PAYMENT_COUNT',
      target: 1,
      rewardAttempts: 3,
      isActive: true,
      startsAt: null,
      endsAt: null,
    }
    mocks.prisma.bonusBoxMission.findMany.mockResolvedValue([{
      ...mission,
      progress: [{
        id: 'progress-1',
        value: 1,
        lastProgressAt: null,
        completedAt: new Date(),
        claimedAt: null,
      }],
    }])
    mocks.prisma.payment.findMany.mockResolvedValue([{ paidAt: new Date() }])
    mocks.prisma.bonusBoxMissionProgress.findUnique.mockResolvedValue({
      id: 'progress-1',
      missionId: mission.id,
      userId: 'user-1',
      value: 1,
      completedAt: new Date(),
      claimedAt: null,
      mission,
    })
    mocks.prisma.bonusBoxMissionProgress.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.bonusBoxAttempt.createMany.mockResolvedValue({ count: 3 })

    const result = await claimBonusBoxMission('user-1', mission.id)

    expect(result).toEqual({ title: mission.title, attempts: 3 })
    expect(mocks.prisma.bonusBoxAttempt.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ source: 'MISSION', sourceKey: 'mission:mission-1:1' }),
      ]),
      skipDuplicates: true,
    })
  })

  it('multiplies selected seasonal prize weights without mutating other prizes', () => {
    const prizes = [
      prize('base', 10),
      prize('seasonal', 5),
    ]

    const weighted = applyActiveEventWeights(prizes, [{
      id: 'event-1',
      prizeIds: ['seasonal'],
      weightMultiplier: 3,
    }])

    expect(weighted.map((item) => item.weight)).toEqual([10, 15])
    expect(prizes.map((item) => item.weight)).toEqual([10, 5])
  })

  it('advances a consecutive login mission once per calendar day', async () => {
    mocks.prisma.bonusBoxMission.findMany.mockResolvedValue([{
      id: 'login-streak',
      type: 'LOGIN_STREAK',
      target: 3,
      startsAt: null,
      progress: [{
        value: 2,
        lastProgressAt: new Date('2026-07-23T18:00:00.000Z'),
        completedAt: null,
      }],
    }])

    await refreshBonusBoxMissionProgress('user-1')

    expect(mocks.prisma.bonusBoxMissionProgress.upsert).toHaveBeenCalledWith({
      where: {
        missionId_userId: {
          missionId: 'login-streak',
          userId: 'user-1',
        },
      },
      create: expect.objectContaining({
        value: 3,
        completedAt: new Date('2026-07-24T12:00:00.000Z'),
      }),
      update: expect.objectContaining({
        value: 3,
        completedAt: new Date('2026-07-24T12:00:00.000Z'),
      }),
    })
  })

  it('blocks a fingerprint shared by five bonus accounts', async () => {
    process.env.TRUSTED_PROXY_HEADERS = 'true'
    mocks.prisma.bonusBoxRiskSignal.findMany.mockResolvedValue([
      { userId: 'user-2' },
      { userId: 'user-3' },
      { userId: 'user-4' },
      { userId: 'user-5' },
    ])
    mocks.prisma.user.findUnique.mockResolvedValue({ referredById: null })
    mocks.prisma.bonusBoxAttempt.count.mockResolvedValue(1)
    mocks.prisma.bonusBoxRiskSignal.upsert.mockResolvedValue({})
    const req = new Request('https://cabinet.test/api/bonus-box', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '203.0.113.10',
        'user-agent': 'test-browser',
      },
    })

    await expect(assessBonusBoxRisk('user-1', req)).rejects.toMatchObject({
      score: 100,
    })
  })
})

function prize(id: string, weight: number): BonusBoxPrize {
  return {
    id,
    title: id,
    description: null,
    type: 'BONUS_ATTEMPTS',
    value: 1,
    weight,
    rarity: 'COMMON',
    isActive: true,
    maxWins: null,
    winsCount: 0,
    promoExpiresInDays: null,
    estimatedCostKopecks: 0,
    eventOnly: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}
