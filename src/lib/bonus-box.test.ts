import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BonusBoxPrize, BonusBoxRarity } from '@prisma/client'

const mocks = vi.hoisted(() => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    bonusBoxAttempt: {
      count: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    bonusBoxPrize: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    bonusBoxSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    bonusBoxOpening: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    subscription: {
      update: vi.fn(),
    },
    promoCode: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn) => fn(prisma)),
  }

  return { prisma }
})

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./remnawave', () => ({ remnawave: {} }))

import {
  applyBonusBoxEconomyGuard,
  getBonusBoxConfig,
  getBonusBoxOverview,
  grantWeeklyBonusBoxAttempts,
  openBonusBox,
} from './bonus-box'

type Config = ReturnType<typeof getBonusBoxConfig>

const config: Config = {
  enabled: true,
  rubPerAttempt: 300,
  minAttemptsPerPayment: 1,
  maxAttemptsPerPayment: 10,
  attemptTtlDays: 30,
  weeklyEnabled: true,
  weeklyDay: 5,
  weeklyAttempts: 1,
  weeklyMaxBalance: 3,
  referrerAttempts: 2,
  referredAttempts: 1,
  promoExpiresInDays: 7,
  economyGuardEnabled: true,
  rareCooldownOpenings: 2,
  epicCooldownOpenings: 8,
  legendaryCooldownOpenings: 30,
  epicMinOpenings: 4,
  legendaryMinOpenings: 12,
  pityEnabled: true,
  pityOpenings: 10,
  showBestRecentOpening: true,
  activePromoRewardsLimit: 3,
}

describe('grantWeeklyBonusBoxAttempts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    process.env.BONUS_BOX_WEEKLY_DAY = '5'
    process.env.BONUS_BOX_WEEKLY_ATTEMPTS = '1'
    process.env.BONUS_BOX_WEEKLY_MAX_BALANCE = '3'
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.BONUS_BOX_WEEKLY_DAY
    delete process.env.BONUS_BOX_WEEKLY_ATTEMPTS
    delete process.env.BONUS_BOX_WEEKLY_MAX_BALANCE
  })

  it('grants the Friday weekly attempt when the user visits on Saturday', async () => {
    vi.setSystemTime(new Date('2026-06-27T12:00:00.000Z'))
    mocks.prisma.user.findUnique.mockResolvedValue({
      remnawaveUuid: 'rw-1',
      subscriptions: [{ id: 'sub-1' }],
    })
    mocks.prisma.bonusBoxAttempt.count.mockResolvedValue(0)
    mocks.prisma.bonusBoxAttempt.createMany.mockImplementation(({ data }) => Promise.resolve({ count: data.length }))

    const result = await grantWeeklyBonusBoxAttempts('user-1')

    expect(result.granted).toBe(1)
    expect(mocks.prisma.bonusBoxAttempt.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user-1',
          source: 'WEEKLY',
          sourceKey: '2026-W26:1',
        }),
      ],
      skipDuplicates: true,
    })
  })
})

describe('openBonusBox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'))
    mocks.prisma.$transaction.mockImplementation(async (fn) => fn(mocks.prisma))
    mocks.prisma.bonusBoxSetting.findUnique.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('grants extra box attempts when the prize type is BONUS_ATTEMPTS', async () => {
    const attemptPrize = prize('attempts-prize', 'COMMON', 'BONUS_ATTEMPTS', 2)
    mocks.prisma.bonusBoxAttempt.findFirst.mockResolvedValue({ id: 'attempt-1', source: 'PAYMENT', sourceKey: 'payment-1:1' })
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: 'rw-1',
      subscriptions: [
        {
          id: 'sub-1',
          expireAt: new Date('2026-07-24T00:00:00.000Z'),
          trafficLimitBytes: null,
        },
      ],
    })
    mocks.prisma.bonusBoxPrize.findMany.mockResolvedValue([attemptPrize])
    mocks.prisma.bonusBoxPrize.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.bonusBoxAttempt.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.bonusBoxAttempt.createMany.mockImplementation(({ data }) => Promise.resolve({ count: data.length }))
    mocks.prisma.bonusBoxOpening.create.mockResolvedValue({ id: 'opening-1', promoCode: null })
    mocks.prisma.bonusBoxOpening.findMany.mockResolvedValue([])
    mocks.prisma.bonusBoxAttempt.count.mockResolvedValue(2)

    const result = await openBonusBox('user-1')

    expect(result.remainingAttempts).toBe(2)
    expect(mocks.prisma.bonusBoxAttempt.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 'user-1', source: 'PRIZE' }),
        expect.objectContaining({ userId: 'user-1', source: 'PRIZE' }),
      ]),
      skipDuplicates: true,
    })
  })

  it('records a no-prize opening without granting any reward', async () => {
    const emptyPrize = prize('empty-prize', 'COMMON', 'NO_PRIZE', 0)
    mocks.prisma.bonusBoxAttempt.findFirst.mockResolvedValue({ id: 'attempt-1', source: 'PAYMENT', sourceKey: 'payment-1:1' })
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: 'rw-1',
      subscriptions: [
        {
          id: 'sub-1',
          expireAt: new Date('2026-07-24T00:00:00.000Z'),
          trafficLimitBytes: 10n,
        },
      ],
    })
    mocks.prisma.bonusBoxPrize.findMany.mockResolvedValue([emptyPrize])
    mocks.prisma.bonusBoxPrize.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.bonusBoxAttempt.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.bonusBoxOpening.create.mockResolvedValue({ id: 'opening-1', promoCode: null })
    mocks.prisma.bonusBoxOpening.findMany.mockResolvedValue([])
    mocks.prisma.bonusBoxAttempt.count.mockResolvedValue(0)

    const result = await openBonusBox('user-1')

    expect(result.prize.type).toBe('NO_PRIZE')
    expect(result.remainingAttempts).toBe(0)
    expect(result.remoteSynced).toBe(true)
    expect(mocks.prisma.subscription.update).not.toHaveBeenCalled()
    expect(mocks.prisma.promoCode.create).not.toHaveBeenCalled()
    expect(mocks.prisma.bonusBoxAttempt.createMany).not.toHaveBeenCalled()
  })

  it('allows a welcome attempt before the first subscription', async () => {
    const promoPrize = prize('promo-prize', 'COMMON', 'PROMO_CODE_PERCENT', 20)
    mocks.prisma.bonusBoxAttempt.findFirst.mockResolvedValue({
      id: 'attempt-1',
      source: 'MANUAL',
      sourceKey: 'welcome:setting-1:1',
    })
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: null,
      subscriptions: [],
    })
    mocks.prisma.bonusBoxPrize.findMany.mockResolvedValue([promoPrize])
    mocks.prisma.bonusBoxPrize.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.bonusBoxAttempt.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.promoCode.create.mockResolvedValue({
      id: 'promo-1',
      code: 'BOX-WELCOME',
      expiresAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    mocks.prisma.bonusBoxOpening.create.mockResolvedValue({
      id: 'opening-1',
      promoCode: { code: 'BOX-WELCOME', expiresAt: new Date('2026-07-01T00:00:00.000Z') },
    })
    mocks.prisma.bonusBoxOpening.findMany.mockResolvedValue([])
    mocks.prisma.bonusBoxAttempt.count.mockResolvedValue(0)

    const result = await openBonusBox('user-1')

    expect(result.prize.type).toBe('PROMO_CODE_PERCENT')
    expect(result.promoCode).toBe('BOX-WELCOME')
    expect(mocks.prisma.subscription.update).not.toHaveBeenCalled()
    expect(mocks.prisma.bonusBoxPrize.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'promo-prize' }) })
    )
  })

  it('records a subscription-days prize from a welcome attempt without an active subscription', async () => {
    const daysPrize = prize('days-prize', 'RARE', 'SUBSCRIPTION_DAYS', 7)
    mocks.prisma.bonusBoxAttempt.findFirst.mockResolvedValue({
      id: 'attempt-1',
      source: 'MANUAL',
      sourceKey: 'welcome:setting-1:1',
    })
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: null,
      subscriptions: [],
    })
    mocks.prisma.bonusBoxPrize.findMany.mockResolvedValue([daysPrize])
    mocks.prisma.bonusBoxPrize.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.bonusBoxAttempt.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.bonusBoxOpening.create.mockResolvedValue({ id: 'opening-1', promoCode: null })
    mocks.prisma.bonusBoxOpening.findMany.mockResolvedValue([])
    mocks.prisma.bonusBoxAttempt.count.mockResolvedValue(0)

    const result = await openBonusBox('user-1')

    expect(result.prize.type).toBe('SUBSCRIPTION_DAYS')
    expect(result.remoteSynced).toBe(true)
    expect(mocks.prisma.subscription.update).not.toHaveBeenCalled()
    expect(mocks.prisma.bonusBoxOpening.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          awardedSubscriptionId: null,
          promoCodeId: null,
        }),
      })
    )
  })

  it('guarantees a rare prize when pity progress reaches the threshold', async () => {
    const commonPrize = prize('common-prize', 'COMMON', 'BONUS_ATTEMPTS', 1, 10_000)
    const rarePrize = prize('rare-prize', 'RARE', 'BONUS_ATTEMPTS', 2, 1)
    mocks.prisma.bonusBoxSetting.findUnique.mockResolvedValue({
      pityEnabled: true,
      pityOpenings: 2,
      showBestRecentOpening: true,
      activePromoRewardsLimit: 3,
    })
    mocks.prisma.bonusBoxAttempt.findFirst.mockResolvedValue({ id: 'attempt-1', source: 'PAYMENT', sourceKey: 'payment-1:1' })
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: 'rw-1',
      subscriptions: [
        {
          id: 'sub-1',
          expireAt: new Date('2026-07-24T00:00:00.000Z'),
          trafficLimitBytes: null,
        },
      ],
    })
    mocks.prisma.bonusBoxPrize.findMany.mockResolvedValue([commonPrize, rarePrize])
    mocks.prisma.bonusBoxOpening.findMany.mockResolvedValue(history(['COMMON', 'COMMON']))
    mocks.prisma.bonusBoxPrize.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.bonusBoxAttempt.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.bonusBoxAttempt.createMany.mockResolvedValue({ count: 2 })
    mocks.prisma.bonusBoxOpening.create.mockResolvedValue({ id: 'opening-1', promoCode: null })
    mocks.prisma.bonusBoxAttempt.count.mockResolvedValue(0)

    const result = await openBonusBox('user-1')

    expect(result.prize.id).toBe('rare-prize')
    expect(mocks.prisma.bonusBoxPrize.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'rare-prize' }) })
    )
  })

  it('rejects a box attempt that was already claimed concurrently', async () => {
    const emptyPrize = prize('empty-prize', 'COMMON', 'NO_PRIZE', 0)
    mocks.prisma.bonusBoxAttempt.findFirst.mockResolvedValue({ id: 'attempt-1', source: 'PAYMENT', sourceKey: 'payment-1:1' })
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: 'rw-1',
      subscriptions: [
        {
          id: 'sub-1',
          expireAt: new Date('2026-07-24T00:00:00.000Z'),
          trafficLimitBytes: null,
        },
      ],
    })
    mocks.prisma.bonusBoxAttempt.updateMany.mockResolvedValue({ count: 0 })
    mocks.prisma.bonusBoxPrize.findMany.mockResolvedValue([emptyPrize])

    await expect(openBonusBox('user-1')).rejects.toMatchObject({ code: 'ATTEMPT_ALREADY_USED' })
    expect(mocks.prisma.bonusBoxPrize.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.bonusBoxOpening.create).not.toHaveBeenCalled()
  })
})

describe('getBonusBoxOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'))
    process.env.BONUS_BOX_WEEKLY_ENABLED = 'false'
    mocks.prisma.bonusBoxSetting.findUnique.mockResolvedValue({
      pityEnabled: true,
      pityOpenings: 3,
      showBestRecentOpening: false,
      activePromoRewardsLimit: 0,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.BONUS_BOX_WEEKLY_ENABLED
  })

  it('shows base chances to the user even when the economy guard closes a prize', async () => {
    mocks.prisma.bonusBoxAttempt.findMany.mockResolvedValue([])
    mocks.prisma.bonusBoxPrize.findMany.mockResolvedValue([
      prize('common', 'COMMON', 'SUBSCRIPTION_DAYS', 1, 40),
      prize('rare', 'RARE', 'BONUS_ATTEMPTS', 2, 60),
    ])
    mocks.prisma.bonusBoxOpening.findMany.mockResolvedValue([
      {
        id: 'opening-1',
        createdAt: new Date('2026-06-24T11:00:00.000Z'),
        prize: prize('recent-rare', 'RARE'),
        promoCode: null,
      },
    ])
    mocks.prisma.user.findUnique.mockResolvedValue({
      remnawaveUuid: 'rw-1',
      subscriptions: [{ id: 'sub-1' }],
    })

    const overview = await getBonusBoxOverview('user-1')

    expect(overview.prizes.find((item) => item.id === 'common')?.chance).toBe(0.4)
    expect(overview.prizes.find((item) => item.id === 'rare')?.chance).toBe(0.6)
    expect(overview.pityProgress).toMatchObject({
      enabled: true,
      threshold: 3,
      current: 0,
      remaining: 3,
      guaranteedNext: false,
    })
  })

  it('shows the best recent opening instead of the latest opening', async () => {
    mocks.prisma.bonusBoxSetting.findUnique.mockResolvedValue({
      pityEnabled: true,
      pityOpenings: 3,
      showBestRecentOpening: true,
      activePromoRewardsLimit: 0,
    })
    mocks.prisma.bonusBoxAttempt.findMany.mockResolvedValue([])
    mocks.prisma.bonusBoxPrize.findMany.mockResolvedValue([
      prize('common', 'COMMON', 'SUBSCRIPTION_DAYS', 1, 40),
      prize('legendary', 'LEGENDARY', 'SUBSCRIPTION_DAYS', 30, 1),
    ])
    mocks.prisma.bonusBoxOpening.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'latest-common',
          createdAt: new Date('2026-06-24T11:00:00.000Z'),
          prize: prize('latest-common', 'COMMON', 'SUBSCRIPTION_DAYS', 1),
          user: { name: 'Анна', email: 'anna@example.com' },
        },
        {
          id: 'older-legendary',
          createdAt: new Date('2026-06-23T11:00:00.000Z'),
          prize: prize('older-legendary', 'LEGENDARY', 'SUBSCRIPTION_DAYS', 30),
          user: { name: 'Ольга', email: 'olga@example.com' },
        },
      ])
    mocks.prisma.user.findUnique.mockResolvedValue({
      remnawaveUuid: 'rw-1',
      subscriptions: [{ id: 'sub-1' }],
    })

    const overview = await getBonusBoxOverview('user-1')

    expect(overview.bestRecentOpening).toMatchObject({
      id: 'older-legendary',
      title: 'older-legendary',
      label: '+30 дн.',
      rarity: 'LEGENDARY',
      userLabel: 'Ольга',
    })
  })
})

describe('applyBonusBoxEconomyGuard', () => {
  it('does not let frequent rare prizes reset the legendary path', () => {
    const available = applyBonusBoxEconomyGuard(
      prizes(),
      history([
        'RARE',
        'COMMON',
        'COMMON',
        'RARE',
        'COMMON',
        'COMMON',
        'RARE',
        'COMMON',
        'COMMON',
        'RARE',
        'COMMON',
        'COMMON',
      ]),
      config
    )

    expect(ids(available)).toContain('legendary')
  })

  it('allows epic after the short rare pause instead of the full epic cooldown', () => {
    const available = applyBonusBoxEconomyGuard(
      prizes(),
      history(['COMMON', 'COMMON', 'RARE', 'COMMON', 'COMMON', 'COMMON']),
      config
    )

    expect(ids(available)).toContain('epic')
  })

  it('does not let epic prizes reset the legendary path', () => {
    const available = applyBonusBoxEconomyGuard(
      prizes(),
      history([
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'EPIC',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
      ]),
      config
    )

    expect(ids(available)).toContain('legendary')
  })

  it('keeps legendary closed for the long cooldown after a legendary prize', () => {
    const available = applyBonusBoxEconomyGuard(
      prizes(),
      history([
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'LEGENDARY',
      ]),
      config
    )

    expect(ids(available)).not.toContain('legendary')
  })
})

function prizes() {
  return [
    prize('common', 'COMMON'),
    prize('rare', 'RARE'),
    prize('epic', 'EPIC'),
    prize('legendary', 'LEGENDARY'),
  ]
}

function prize(
  id: string,
  rarity: BonusBoxRarity,
  type: BonusBoxPrize['type'] = 'SUBSCRIPTION_DAYS',
  value = 1,
  weight = 10
): BonusBoxPrize {
  return {
    id,
    title: id,
    description: null,
    type,
    value,
    weight,
    rarity,
    isActive: true,
    maxWins: null,
    winsCount: 0,
    promoExpiresInDays: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  }
}

function history(rarities: BonusBoxRarity[]) {
  return rarities.map((rarity) => ({ prize: { rarity } }))
}

function ids(prizes: BonusBoxPrize[]) {
  return prizes.map((prize) => prize.id)
}
