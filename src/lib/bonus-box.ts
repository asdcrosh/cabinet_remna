import { randomBytes, randomInt } from 'node:crypto'
import { Prisma, type BonusBoxPrize, type BonusBoxPrizeType, type BonusBoxRarity } from '@prisma/client'
import { prisma } from './prisma'
import { logError } from './logger'
import { remnawave } from './remnawave'
import { gbToBytes } from './format'
import { cleanupExpiredBonusBoxPromoCodes } from './promo-code-cleanup'
import { syncCabinetPromoCodeToRemnashopBestEffort } from './remnashop-promo-sync'

const DEFAULT_RUB_PER_ATTEMPT = 300
const DEFAULT_ATTEMPT_TTL_DAYS = 30
const DEFAULT_WEEKLY_DAY = 5
const DEFAULT_PROMO_EXPIRES_IN_DAYS = 7
const DEFAULT_RARE_COOLDOWN_OPENINGS = 2
const DEFAULT_EPIC_COOLDOWN_OPENINGS = 8
const DEFAULT_LEGENDARY_COOLDOWN_OPENINGS = 30
const DEFAULT_EPIC_MIN_OPENINGS = 4
const DEFAULT_LEGENDARY_MIN_OPENINGS = 12
const DEFAULT_PITY_OPENINGS = 10
const DEFAULT_ACTIVE_PROMO_REWARDS_LIMIT = 3
const BONUS_BOX_SETTINGS_ID = 'default'
const ECONOMY_HISTORY_LIMIT = 80
const REEL_ITEM_COUNT = 88
const REEL_WINNING_BASE_INDEX = 72
const REEL_WINNING_SPREAD = 4
const WELCOME_ATTEMPT_PREFIX = 'welcome:'

const RARITY_VISUAL_WEIGHT: Record<BonusBoxPublicPrize['rarity'], number> = {
  COMMON: 1,
  RARE: 0.46,
  EPIC: 0.2,
  LEGENDARY: 0.08,
}

const RARITY_SAME_PRIZE_GAP: Record<BonusBoxPublicPrize['rarity'], number> = {
  COMMON: 1,
  RARE: 4,
  EPIC: 8,
  LEGENDARY: 14,
}

const RARITY_PREMIUM_GAP: Record<BonusBoxPublicPrize['rarity'], number> = {
  COMMON: 0,
  RARE: 2,
  EPIC: 3,
  LEGENDARY: 5,
}

type BonusBoxTx = Prisma.TransactionClient

export type BonusBoxPublicPrize = {
  id: string
  title: string
  description: string | null
  type: BonusBoxPrizeType
  value: number
  weight: number
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'
  chance: number
}

export type BonusBoxOpeningResult = {
  id: string
  prize: BonusBoxPublicPrize
  reel: BonusBoxPublicPrize[]
  winningIndex: number
  stopOffsetRatio: number
  promoCode: string | null
  promoCodeExpiresAt: string | null
  remainingAttempts: number
  remoteSynced: boolean
}

export type BonusBoxSettings = {
  pityEnabled: boolean
  pityOpenings: number
  showBestRecentOpening: boolean
  activePromoRewardsLimit: number
}

export class BonusBoxError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'BONUS_BOX_ERROR'
  ) {
    super(message)
    this.name = 'BonusBoxError'
  }
}

export function getBonusBoxConfig() {
  return {
    enabled: envBool('BONUS_BOX_ENABLED', true),
    rubPerAttempt: envInt('BONUS_BOX_RUB_PER_ATTEMPT', DEFAULT_RUB_PER_ATTEMPT, 1, 1_000_000),
    minAttemptsPerPayment: envInt('BONUS_BOX_MIN_ATTEMPTS_PER_PAYMENT', 1, 0, 100),
    maxAttemptsPerPayment: envInt('BONUS_BOX_MAX_ATTEMPTS_PER_PAYMENT', 10, 1, 100),
    attemptTtlDays: envInt('BONUS_BOX_ATTEMPT_TTL_DAYS', DEFAULT_ATTEMPT_TTL_DAYS, 0, 3650),
    weeklyEnabled: envBool('BONUS_BOX_WEEKLY_ENABLED', true),
    weeklyDay: envInt('BONUS_BOX_WEEKLY_DAY', DEFAULT_WEEKLY_DAY, 0, 6),
    weeklyAttempts: envInt('BONUS_BOX_WEEKLY_ATTEMPTS', 1, 0, 20),
    weeklyMaxBalance: envInt('BONUS_BOX_WEEKLY_MAX_BALANCE', 3, 0, 100),
    referrerAttempts: envInt('BONUS_BOX_REFERRER_ATTEMPTS', 2, 0, 100),
    referredAttempts: envInt('BONUS_BOX_REFERRED_ATTEMPTS', 1, 0, 100),
    promoExpiresInDays: envInt('BONUS_BOX_PROMO_EXPIRES_IN_DAYS', DEFAULT_PROMO_EXPIRES_IN_DAYS, 1, 365),
    economyGuardEnabled: envBool('BONUS_BOX_ECONOMY_GUARD_ENABLED', true),
    rareCooldownOpenings: envInt('BONUS_BOX_RARE_COOLDOWN_OPENINGS', DEFAULT_RARE_COOLDOWN_OPENINGS, 0, 1000),
    epicCooldownOpenings: envInt('BONUS_BOX_EPIC_COOLDOWN_OPENINGS', DEFAULT_EPIC_COOLDOWN_OPENINGS, 0, 1000),
    legendaryCooldownOpenings: envInt('BONUS_BOX_LEGENDARY_COOLDOWN_OPENINGS', DEFAULT_LEGENDARY_COOLDOWN_OPENINGS, 0, 1000),
    epicMinOpenings: envInt('BONUS_BOX_EPIC_MIN_OPENINGS', DEFAULT_EPIC_MIN_OPENINGS, 0, 1000),
    legendaryMinOpenings: envInt('BONUS_BOX_LEGENDARY_MIN_OPENINGS', DEFAULT_LEGENDARY_MIN_OPENINGS, 0, 1000),
    pityEnabled: envBool('BONUS_BOX_PITY_ENABLED', true),
    pityOpenings: envInt('BONUS_BOX_PITY_OPENINGS', DEFAULT_PITY_OPENINGS, 2, 100),
    showBestRecentOpening: envBool('BONUS_BOX_SHOW_BEST_RECENT_OPENING', true),
    activePromoRewardsLimit: envInt('BONUS_BOX_ACTIVE_PROMO_REWARDS_LIMIT', DEFAULT_ACTIVE_PROMO_REWARDS_LIMIT, 0, 12),
  }
}

export async function getBonusBoxSettings(
  tx: Pick<BonusBoxTx, 'bonusBoxSetting'> = prisma
): Promise<BonusBoxSettings> {
  const config = getBonusBoxConfig()
  const settings = await tx.bonusBoxSetting.findUnique({
    where: { id: BONUS_BOX_SETTINGS_ID },
  })

  return {
    pityEnabled: settings?.pityEnabled ?? config.pityEnabled,
    pityOpenings: clamp(settings?.pityOpenings ?? config.pityOpenings, 2, 100),
    showBestRecentOpening: settings?.showBestRecentOpening ?? config.showBestRecentOpening,
    activePromoRewardsLimit: clamp(
      settings?.activePromoRewardsLimit ?? config.activePromoRewardsLimit,
      0,
      12
    ),
  }
}

export async function updateBonusBoxSettings(input: BonusBoxSettings) {
  return prisma.bonusBoxSetting.upsert({
    where: { id: BONUS_BOX_SETTINGS_ID },
    create: {
      id: BONUS_BOX_SETTINGS_ID,
      pityEnabled: input.pityEnabled,
      pityOpenings: clamp(input.pityOpenings, 2, 100),
      showBestRecentOpening: input.showBestRecentOpening,
      activePromoRewardsLimit: clamp(input.activePromoRewardsLimit, 0, 12),
    },
    update: {
      pityEnabled: input.pityEnabled,
      pityOpenings: clamp(input.pityOpenings, 2, 100),
      showBestRecentOpening: input.showBestRecentOpening,
      activePromoRewardsLimit: clamp(input.activePromoRewardsLimit, 0, 12),
    },
  })
}

async function getBonusBoxRuntimeConfig() {
  const config = getBonusBoxConfig()
  const settings = await getBonusBoxSettings()
  return { ...config, ...settings }
}

export async function getBonusBoxOverview(userId: string) {
  await Promise.all([
    grantWeeklyBonusBoxAttempts(userId),
    cleanupExpiredBonusBoxPromoCodes(),
  ])

  const now = new Date()
  const config = await getBonusBoxRuntimeConfig()
  const [attempts, prizeRows, openings, activePromoRewards, bestRecentOpening, vpnAccess] = await Promise.all([
    prisma.bonusBoxAttempt.findMany({
      where: {
        userId,
        usedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, source: true, sourceKey: true, expiresAt: true, createdAt: true },
    }),
    getPrizeRows(prisma),
    prisma.bonusBoxOpening.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: ECONOMY_HISTORY_LIMIT,
      include: { prize: true, promoCode: true },
    }),
    getActivePromoRewards(userId, config.activePromoRewardsLimit, now),
    config.showBestRecentOpening ? getBestRecentOpening(now) : Promise.resolve(null),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        remnawaveUuid: true,
        subscriptions: {
          where: {
            status: { in: ['ACTIVE', 'LIMITED'] },
            expireAt: { gt: now },
          },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ])
  const prizes = publicPrizesWithChances(prizeRows, prizeRows)
  const hasActiveSubscription = Boolean(vpnAccess?.remnawaveUuid && vpnAccess.subscriptions.length > 0)
  const welcomeAttemptsCount = attempts.filter(isWelcomeBonusAttempt).length

  return {
    config,
    hasActiveSubscription,
    attempts: attempts.map((attempt) => ({
      ...attempt,
      expiresAt: attempt.expiresAt?.toISOString() ?? null,
      createdAt: attempt.createdAt.toISOString(),
    })),
    attemptsCount: attempts.length,
    welcomeAttemptsCount,
    canOpenReason: getCanOpenReason({
      enabled: config.enabled,
      attemptsCount: attempts.length,
      prizesCount: prizeRows.length,
      hasActiveSubscription,
      welcomeAttemptsCount,
    }),
    pityProgress: buildPityProgress(openings, config),
    openingStreak: buildOpeningStreak(openings.length),
    bestRecentOpening,
    activePromoRewards,
    prizes,
    openings: openings.slice(0, 12).map((opening) => ({
      id: opening.id,
      createdAt: opening.createdAt.toISOString(),
      prize: publicPrizeFromPrize(opening.prize, 0),
      promoCode: opening.promoCode?.code ?? null,
      promoCodeExpiresAt: opening.promoCode?.expiresAt?.toISOString() ?? null,
    })),
  }
}

export async function grantPaymentBonusBoxAttempts(paymentId: string) {
  const config = getBonusBoxConfig()
  if (!config.enabled) return { granted: 0 }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      userId: true,
      amountKopecks: true,
      status: true,
      subscriptionProvisionedAt: true,
    },
  })

  if (!payment || payment.status !== 'SUCCEEDED' || !payment.subscriptionProvisionedAt) {
    return { granted: 0, reason: 'payment_not_provisioned' as const }
  }
  if (payment.amountKopecks <= 0) return { granted: 0, reason: 'free_payment' as const }

  const rawAttempts = Math.floor(payment.amountKopecks / 100 / config.rubPerAttempt)
  const attemptsCount = clamp(
    Math.max(config.minAttemptsPerPayment, rawAttempts),
    0,
    config.maxAttemptsPerPayment
  )
  if (attemptsCount <= 0) return { granted: 0 }

  const result = await prisma.bonusBoxAttempt.createMany({
    data: makeAttempts({
      userId: payment.userId,
      source: 'PAYMENT',
      sourceKeyPrefix: payment.id,
      attemptsCount,
    }),
    skipDuplicates: true,
  })

  return { granted: result.count }
}

export async function grantReferralBonusBoxAttemptsForPayment(paymentId: string) {
  const config = getBonusBoxConfig()
  if (!config.enabled || (config.referrerAttempts <= 0 && config.referredAttempts <= 0)) {
    return { granted: 0 }
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      userId: true,
      amountKopecks: true,
      status: true,
      subscriptionProvisionedAt: true,
      user: { select: { referredById: true } },
    },
  })

  if (!payment || payment.status !== 'SUCCEEDED' || !payment.subscriptionProvisionedAt || payment.amountKopecks <= 0) {
    return { granted: 0 }
  }
  if (!payment.user.referredById || payment.user.referredById === payment.userId) {
    return { granted: 0 }
  }

  const reward = await prisma.referralReward.findUnique({
    where: { referredUserId: payment.userId },
    select: { id: true, referrerId: true, referredUserId: true },
  })
  if (!reward) return { granted: 0 }

  const rows = [
    ...makeAttempts({
      userId: reward.referrerId,
      source: 'REFERRAL',
      sourceKeyPrefix: `referrer:${reward.id}`,
      attemptsCount: config.referrerAttempts,
    }),
    ...makeAttempts({
      userId: reward.referredUserId,
      source: 'REFERRAL',
      sourceKeyPrefix: `referred:${reward.id}`,
      attemptsCount: config.referredAttempts,
    }),
  ]

  if (rows.length === 0) return { granted: 0 }
  const result = await prisma.bonusBoxAttempt.createMany({ data: rows, skipDuplicates: true })
  return { granted: result.count }
}

export async function grantManualBonusBoxAttempts(input: {
  userId: string
  adminId: string
  attemptsCount: number
}) {
  const config = getBonusBoxConfig()
  if (!config.enabled) {
    throw new BonusBoxError('Подарочный бокс сейчас недоступен', 403, 'BONUS_BOX_DISABLED')
  }

  const attemptsCount = clamp(input.attemptsCount, 1, 100)
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  })
  if (!user) {
    throw new BonusBoxError('Пользователь не найден', 404, 'USER_NOT_FOUND')
  }

  const sourceKeyPrefix = `admin:${input.adminId}:${Date.now()}:${randomBytes(4).toString('hex')}`
  const result = await prisma.bonusBoxAttempt.createMany({
    data: makeAttempts({
      userId: input.userId,
      source: 'MANUAL',
      sourceKeyPrefix,
      attemptsCount,
    }),
    skipDuplicates: true,
  })

  return {
    granted: result.count,
    attemptsCount: await countAvailableAttempts(input.userId),
  }
}

export async function grantWeeklyBonusBoxAttempts(userId: string) {
  const config = getBonusBoxConfig()
  if (!config.enabled || !config.weeklyEnabled || config.weeklyAttempts <= 0) return { granted: 0 }

  const now = new Date()
  const weeklyBonusDate = getCurrentWeeklyBonusDate(now, config.weeklyDay)

  const vpnAccess = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      remnawaveUuid: true,
      subscriptions: {
        where: {
          status: { in: ['ACTIVE', 'LIMITED'] },
          expireAt: { gt: now },
        },
        select: { id: true },
        take: 1,
      },
    },
  })
  if (!vpnAccess?.remnawaveUuid || vpnAccess.subscriptions.length === 0) {
    return { granted: 0, reason: 'no_active_subscription' as const }
  }

  let remainingWeeklySlots = Number.POSITIVE_INFINITY
  if (config.weeklyMaxBalance > 0) {
    const weeklyBalance = await prisma.bonusBoxAttempt.count({
      where: {
        userId,
        source: 'WEEKLY',
        usedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    })
    if (weeklyBalance >= config.weeklyMaxBalance) {
      return { granted: 0, reason: 'weekly_balance_limit' as const }
    }
    remainingWeeklySlots = config.weeklyMaxBalance - weeklyBalance
  }

  const weekKey = getWeekKey(weeklyBonusDate)
  const attemptsCount =
    config.weeklyMaxBalance > 0
      ? Math.min(config.weeklyAttempts, remainingWeeklySlots)
      : config.weeklyAttempts

  const result = await prisma.bonusBoxAttempt.createMany({
    data: makeAttempts({
      userId,
      source: 'WEEKLY',
      sourceKeyPrefix: weekKey,
      attemptsCount,
    }),
    skipDuplicates: true,
  })

  return { granted: result.count }
}

export async function openBonusBox(userId: string): Promise<BonusBoxOpeningResult> {
  const config = await getBonusBoxRuntimeConfig()
  if (!config.enabled) {
    throw new BonusBoxError('Подарочный бокс сейчас недоступен', 403, 'BONUS_BOX_DISABLED')
  }

  const now = new Date()
  const txResult = await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          remnawaveUuid: true,
          subscriptions: {
            where: {
              status: { in: ['ACTIVE', 'LIMITED'] },
              expireAt: { gt: now },
            },
            orderBy: { expireAt: 'desc' },
            take: 1,
          },
        },
      })
      const subscription = user?.subscriptions[0]
      const hasActiveSubscription = Boolean(user && subscription && user.remnawaveUuid)
      if (!user) {
        throw new BonusBoxError('Пользователь не найден', 404, 'USER_NOT_FOUND')
      }

      const attempt = await tx.bonusBoxAttempt.findFirst({
        where: {
          userId,
          usedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          ...(hasActiveSubscription
            ? {}
            : { source: 'MANUAL' as const, sourceKey: { startsWith: WELCOME_ATTEMPT_PREFIX } }),
        },
        orderBy: { createdAt: 'asc' },
      })
      if (!attempt) {
        throw new BonusBoxError(
          hasActiveSubscription ? 'Нет доступных открытий' : 'Нет приветственных открытий без подписки',
          409,
          'NO_ATTEMPTS'
        )
      }
      const isWelcomeAttempt = isWelcomeBonusAttempt(attempt)
      if (!hasActiveSubscription && !isWelcomeAttempt) {
        throw new BonusBoxError('Нужна активная VPN-подписка', 403, 'NO_ACTIVE_SUBSCRIPTION')
      }

      const prizes = await tx.bonusBoxPrize.findMany({
        where: {
          isActive: true,
          weight: { gt: 0 },
        },
        orderBy: { createdAt: 'asc' },
      })
      const eligiblePrizes = prizes
        .filter((prize) => prize.maxWins == null || prize.winsCount < prize.maxWins)
      if (eligiblePrizes.length === 0) {
        throw new BonusBoxError(
          'Администратор ещё не настроил подарки',
          409,
          'NO_PRIZES'
        )
      }

      const recentOpenings = await tx.bonusBoxOpening.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: ECONOMY_HISTORY_LIMIT,
        select: { prize: { select: { rarity: true } } },
      })
      const guardedPrizes = applyBonusBoxEconomyGuard(eligiblePrizes, recentOpenings, config)
      const pityProgress = buildPityProgress(recentOpenings, config)
      const guaranteedPrizes =
        pityProgress.guaranteedNext
          ? eligiblePrizes.filter((item) => rarityRank(item.rarity) >= 1)
          : []
      const prize = pickWeightedPrize(guaranteedPrizes.length > 0 ? guaranteedPrizes : guardedPrizes)
      const claimedPrize = await tx.bonusBoxPrize.updateMany({
        where: {
          id: prize.id,
          isActive: true,
          weight: { gt: 0 },
          OR: [{ maxWins: null }, { winsCount: { lt: prize.maxWins ?? 0 } }],
        },
        data: { winsCount: { increment: 1 } },
      })
      if (claimedPrize.count === 0) {
        throw new BonusBoxError('Подарок уже разобрали, попробуйте ещё раз', 409, 'PRIZE_LIMIT_REACHED')
      }

      await tx.bonusBoxAttempt.update({
        where: { id: attempt.id },
        data: { usedAt: now },
      })

      const application = await applyPrizeInTransaction(tx, {
        userId,
        subscription,
        prize,
        config,
      })

      const opening = await tx.bonusBoxOpening.create({
        data: {
          userId,
          attemptId: attempt.id,
          prizeId: prize.id,
          prizeSnapshot: makePrizeSnapshot(prize),
          awardedSubscriptionId: application.subscriptionId,
          promoCodeId: application.promoCodeId,
        },
        include: { promoCode: true },
      })

      return {
        openingId: opening.id,
        prize,
        promoCodeId: application.promoCodeId,
        promoCode: opening.promoCode?.code ?? null,
        promoCodeExpiresAt: opening.promoCode?.expiresAt?.toISOString() ?? null,
        remoteUpdate:
          application.remoteUpdate
            ? { ...application.remoteUpdate, remnawaveUuid: user.remnawaveUuid! }
            : null,
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )

  let remoteSynced = true
  if (txResult.remoteUpdate) {
    remoteSynced = await syncPrizeToRemnawave(txResult.remoteUpdate)
  }
  if (txResult.promoCodeId) {
    await syncCabinetPromoCodeToRemnashopBestEffort(txResult.promoCodeId)
  }

  const [remainingAttempts, prizes] = await Promise.all([
    countAvailableAttempts(userId),
    getPublicPrizes(),
  ])
  const publicPrize = publicPrizeFromPrize(
    txResult.prize,
    chanceForPrize(txResult.prize, prizes)
  )
  const reel = buildReel(prizes.length > 0 ? prizes : [publicPrize], publicPrize)

  return {
    id: txResult.openingId,
    prize: publicPrize,
    reel: reel.items,
    winningIndex: reel.winningIndex,
    stopOffsetRatio: reel.stopOffsetRatio,
    promoCode: txResult.promoCode,
    promoCodeExpiresAt: txResult.promoCodeExpiresAt,
    remainingAttempts,
    remoteSynced,
  }
}

function isWelcomeBonusAttempt(attempt: { source: string; sourceKey: string }) {
  return attempt.source === 'MANUAL' && attempt.sourceKey.startsWith(WELCOME_ATTEMPT_PREFIX)
}

export async function getPublicPrizes(tx: Pick<BonusBoxTx, 'bonusBoxPrize'> = prisma) {
  const prizes = await getPrizeRows(tx)
  return publicPrizesWithChances(prizes, prizes)
}

async function getPrizeRows(tx: Pick<BonusBoxTx, 'bonusBoxPrize'>) {
  const prizes = await tx.bonusBoxPrize.findMany({
    where: {
      isActive: true,
      weight: { gt: 0 },
    },
    orderBy: [{ rarity: 'asc' }, { createdAt: 'asc' }],
  })
  return prizes.filter((prize) => prize.maxWins == null || prize.winsCount < prize.maxWins)
}

async function applyPrizeInTransaction(
  tx: BonusBoxTx,
  input: {
    userId: string
    subscription?: {
      id: string
      expireAt: Date
      trafficLimitBytes: bigint | null
    }
    prize: BonusBoxPrize
    config: ReturnType<typeof getBonusBoxConfig>
  }
) {
  if (input.prize.type === 'NO_PRIZE') {
    return { promoCodeId: null, subscriptionId: null, remoteUpdate: null }
  }

  if (input.prize.type === 'PROMO_CODE_PERCENT') {
    const promoCode = await createPrizePromoCode(tx, input.userId, input.prize, input.config)
    return { promoCodeId: promoCode.id, subscriptionId: null, remoteUpdate: null }
  }

  if (input.prize.type === 'BONUS_ATTEMPTS') {
    await tx.bonusBoxAttempt.createMany({
      data: makeAttempts({
        userId: input.userId,
        source: 'PRIZE',
        sourceKeyPrefix: `prize:${input.prize.id}:${randomBytes(4).toString('hex')}`,
        attemptsCount: clamp(input.prize.value, 1, 100),
      }),
      skipDuplicates: true,
    })
    return { promoCodeId: null, subscriptionId: null, remoteUpdate: null }
  }

  if (input.prize.type === 'SUBSCRIPTION_DAYS') {
    if (!input.subscription) {
      return { promoCodeId: null, subscriptionId: null, remoteUpdate: null }
    }
    const base = input.subscription.expireAt.getTime() > Date.now() ? input.subscription.expireAt : new Date()
    const expireAt = new Date(base.getTime() + input.prize.value * 24 * 60 * 60 * 1000)
    await tx.subscription.update({
      where: { id: input.subscription.id },
      data: {
        expireAt,
        status: 'ACTIVE',
        pendingSync: true,
        lastSyncedAt: new Date(),
      },
    })
    return {
      promoCodeId: null,
      subscriptionId: input.subscription.id,
      remoteUpdate: { type: 'SUBSCRIPTION_DAYS' as const, subscriptionId: input.subscription.id, expireAt },
    }
  }

  if (!input.subscription) {
    return { promoCodeId: null, subscriptionId: null, remoteUpdate: null }
  }
  const currentLimit = input.subscription.trafficLimitBytes
  const trafficLimitBytes = currentLimit == null ? null : currentLimit + gbToBytes(input.prize.value)
  await tx.subscription.update({
    where: { id: input.subscription.id },
    data: {
      trafficLimitBytes,
      pendingSync: trafficLimitBytes != null,
      lastSyncedAt: new Date(),
    },
  })
  return {
    promoCodeId: null,
    subscriptionId: input.subscription.id,
    remoteUpdate:
      trafficLimitBytes == null
        ? null
        : { type: 'TRAFFIC_GB' as const, subscriptionId: input.subscription.id, trafficLimitBytes },
  }
}

async function createPrizePromoCode(
  tx: BonusBoxTx,
  userId: string,
  prize: BonusBoxPrize,
  config: ReturnType<typeof getBonusBoxConfig>
) {
  const now = new Date()
  const expiresInDays = prize.promoExpiresInDays ?? config.promoExpiresInDays
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000)

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = `BOX-${randomBytes(4).toString('hex').toUpperCase()}`
    try {
      return await tx.promoCode.create({
        data: {
          code,
          discountPercent: prize.value,
          isActive: true,
          startsAt: now,
          expiresAt,
          maxUses: 1,
          maxUsesPerUser: 1,
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        continue
      }
      throw error
    }
  }

  throw new BonusBoxError(`Не удалось создать промокод для ${userId}`, 500, 'PROMO_CREATE_FAILED')
}

async function syncPrizeToRemnawave(
  input:
    | { type: 'SUBSCRIPTION_DAYS'; remnawaveUuid: string; subscriptionId: string; expireAt: Date }
    | { type: 'TRAFFIC_GB'; remnawaveUuid: string; subscriptionId: string; trafficLimitBytes: bigint }
) {
  try {
    const updated = await remnawave.updateUser({
      uuid: input.remnawaveUuid,
      status: 'ACTIVE',
      ...(input.type === 'SUBSCRIPTION_DAYS'
        ? { expireAt: input.expireAt.toISOString() }
        : { trafficLimitBytes: Number(input.trafficLimitBytes) }),
    })

    await prisma.subscription.update({
      where: { id: input.subscriptionId },
      data: {
        ...(input.type === 'SUBSCRIPTION_DAYS' ? { expireAt: new Date(updated.response.expireAt) } : {}),
        pendingSync: false,
        lastSyncedAt: new Date(),
      },
    })
    return true
  } catch (error) {
    logError('bonus_box.remnawave_sync_failed', error, { subscriptionId: input.subscriptionId })
    await prisma.subscription.update({
      where: { id: input.subscriptionId },
      data: { pendingSync: true },
    }).catch(() => undefined)
    return false
  }
}

function makeAttempts(input: {
  userId: string
  source: 'PAYMENT' | 'WEEKLY' | 'REFERRAL' | 'MANUAL' | 'PRIZE'
  sourceKeyPrefix: string
  attemptsCount: number
}) {
  const config = getBonusBoxConfig()
  const expiresAt =
    config.attemptTtlDays > 0
      ? new Date(Date.now() + config.attemptTtlDays * 24 * 60 * 60 * 1000)
      : null

  return Array.from({ length: input.attemptsCount }, (_, index) => ({
    userId: input.userId,
    source: input.source,
    sourceKey: `${input.sourceKeyPrefix}:${index + 1}`,
    expiresAt,
  }))
}

async function countAvailableAttempts(userId: string) {
  const now = new Date()
  return prisma.bonusBoxAttempt.count({
    where: {
      userId,
      usedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  })
}

function publicPrizesWithChances(prizes: BonusBoxPrize[], availablePrizes: BonusBoxPrize[]) {
  const availableIds = new Set(availablePrizes.map((prize) => prize.id))
  const totalWeight = availablePrizes.reduce((sum, prize) => sum + prize.weight, 0)

  return prizes.map((prize) =>
    publicPrizeFromPrize(
      prize,
      availableIds.has(prize.id) && totalWeight > 0 ? prize.weight / totalWeight : 0
    )
  )
}

export function applyBonusBoxEconomyGuard(
  prizes: BonusBoxPrize[],
  recentOpenings: Array<{ prize: { rarity: BonusBoxRarity } }>,
  config: ReturnType<typeof getBonusBoxConfig>
) {
  if (!config.economyGuardEnabled || prizes.length <= 1) return prizes

  const guarded = prizes.filter((prize) => canWinPrizeNow(prize, recentOpenings, config))
  if (guarded.length > 0) return guarded

  const common = prizes.filter((prize) => rarityRank(prize.rarity) === 0)
  if (common.length > 0) return common

  return [prizes.slice().sort((left, right) => rarityRank(left.rarity) - rarityRank(right.rarity))[0]]
}

function canWinPrizeNow(
  prize: BonusBoxPrize,
  recentOpenings: Array<{ prize: { rarity: BonusBoxRarity } }>,
  config: ReturnType<typeof getBonusBoxConfig>
) {
  const rank = rarityRank(prize.rarity)
  if (rank === 0) return true

  const sinceRareOrBetter = openingsSinceRarityAtLeast(recentOpenings, 1)
  if (rank === 1) {
    return sinceRareOrBetter >= config.rareCooldownOpenings
  }

  const sinceEpicOrBetter = openingsSinceRarityAtLeast(recentOpenings, 2)
  if (rank === 2) {
    return recentOpenings.length >= config.epicMinOpenings
      && sinceRareOrBetter >= config.rareCooldownOpenings
      && sinceEpicOrBetter >= config.epicCooldownOpenings
  }

  const sinceLegendary = openingsSinceRarityAtLeast(recentOpenings, 3)
  return recentOpenings.length >= config.legendaryMinOpenings
    && sinceLegendary >= config.legendaryCooldownOpenings
}

function openingsSinceRarityAtLeast(
  recentOpenings: Array<{ prize: { rarity: BonusBoxRarity } }>,
  minRank: number
) {
  const index = recentOpenings.findIndex((opening) => rarityRank(opening.prize.rarity) >= minRank)
  return index === -1 ? Number.POSITIVE_INFINITY : index
}

function pickWeightedPrize(prizes: BonusBoxPrize[]) {
  const totalWeight = prizes.reduce((sum, prize) => sum + prize.weight, 0)
  let cursor = randomInt(Math.max(1, totalWeight))
  for (const prize of prizes) {
    if (cursor < prize.weight) return prize
    cursor -= prize.weight
  }
  return prizes[prizes.length - 1]
}

function buildReel(prizes: BonusBoxPublicPrize[], winner: BonusBoxPublicPrize) {
  const items: Array<BonusBoxPublicPrize | undefined> = Array.from({ length: REEL_ITEM_COUNT })
  const winningIndex = REEL_WINNING_BASE_INDEX + randomInt(REEL_WINNING_SPREAD)
  items[winningIndex] = winner

  for (let index = 0; index < items.length; index++) {
    if (index === winningIndex) continue
    items[index] = pickDisplayPrize(prizes, items, index)
  }

  let stopOffsetRatio = 0.16 + randomInt(68) / 100
  if (stopOffsetRatio > 0.45 && stopOffsetRatio < 0.55) {
    stopOffsetRatio = stopOffsetRatio < 0.5 ? 0.38 : 0.62
  }

  return {
    items: items.map((item) => item ?? pickDisplayPrize(prizes, items, 0)),
    winningIndex,
    stopOffsetRatio,
  }
}

function pickDisplayPrize(
  prizes: BonusBoxPublicPrize[],
  items: Array<BonusBoxPublicPrize | undefined>,
  index: number
) {
  const strictCandidates = prizes.filter((prize) => canPlaceDisplayPrize(prize, items, index, true))
  if (strictCandidates.length > 0) return pickVisualWeightedPrize(strictCandidates)

  const relaxedCandidates = prizes.filter((prize) => canPlaceDisplayPrize(prize, items, index, false))
  if (relaxedCandidates.length > 0) return pickVisualWeightedPrize(relaxedCandidates)

  const previous = items[index - 1]
  const next = items[index + 1]
  const nonAdjacentCandidates = prizes.filter((prize) => prize.id !== previous?.id && prize.id !== next?.id)
  return pickVisualWeightedPrize(nonAdjacentCandidates.length > 0 ? nonAdjacentCandidates : prizes)
}

function canPlaceDisplayPrize(
  prize: BonusBoxPublicPrize,
  items: Array<BonusBoxPublicPrize | undefined>,
  index: number,
  strict: boolean
) {
  const samePrizeGap = RARITY_SAME_PRIZE_GAP[prize.rarity]
  for (let cursor = Math.max(0, index - samePrizeGap); cursor <= Math.min(items.length - 1, index + samePrizeGap); cursor++) {
    if (cursor !== index && items[cursor]?.id === prize.id) return false
  }

  if (!strict) return true

  const premiumGap = RARITY_PREMIUM_GAP[prize.rarity]
  if (premiumGap <= 0) return true

  for (let cursor = Math.max(0, index - premiumGap); cursor <= Math.min(items.length - 1, index + premiumGap); cursor++) {
    const item = items[cursor]
    if (cursor !== index && item && rarityRank(item.rarity) > 0) return false
  }

  return true
}

function pickVisualWeightedPrize(prizes: BonusBoxPublicPrize[]) {
  const weighted = prizes.map((prize) => ({
    prize,
    weight: Math.max(1, Math.round(prize.weight * RARITY_VISUAL_WEIGHT[prize.rarity] * 100)),
  }))
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0)
  let cursor = randomInt(Math.max(1, totalWeight))

  for (const item of weighted) {
    if (cursor < item.weight) return item.prize
    cursor -= item.weight
  }

  return weighted[weighted.length - 1].prize
}

function rarityRank(rarity: BonusBoxPublicPrize['rarity']) {
  if (rarity === 'LEGENDARY') return 3
  if (rarity === 'EPIC') return 2
  if (rarity === 'RARE') return 1
  return 0
}

function publicPrizeFromPrize(prize: BonusBoxPrize, chance: number): BonusBoxPublicPrize {
  return {
    id: prize.id,
    title: prize.title,
    description: prize.description,
    type: prize.type,
    value: prize.value,
    weight: prize.weight,
    rarity: prize.rarity,
    chance,
  }
}

function chanceForPrize(prize: BonusBoxPrize, publicPrizes: BonusBoxPublicPrize[]) {
  return publicPrizes.find((item) => item.id === prize.id)?.chance ?? 0
}

function makePrizeSnapshot(prize: BonusBoxPrize) {
  return {
    title: prize.title,
    description: prize.description,
    type: prize.type,
    value: prize.value,
    rarity: prize.rarity,
  }
}

async function getActivePromoRewards(userId: string, limit: number, now: Date) {
  if (limit <= 0) return []

  const openings = await prisma.bonusBoxOpening.findMany({
    where: {
      userId,
      promoCode: {
        is: {
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.max(limit * 2, limit),
    include: { prize: true, promoCode: true },
  })
  const seenCodes = new Set<string>()

  return openings.flatMap((opening) => {
    const promoCode = opening.promoCode
    if (!promoCode || seenCodes.has(promoCode.code)) return []
    seenCodes.add(promoCode.code)

    return [{
      id: promoCode.id,
      code: promoCode.code,
      discountPercent: promoCode.discountPercent,
      expiresAt: promoCode.expiresAt?.toISOString() ?? null,
      prizeTitle: opening.prize.title,
      createdAt: opening.createdAt.toISOString(),
    }]
  }).slice(0, limit)
}

async function getBestRecentOpening(now: Date) {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const openings = await prisma.bonusBoxOpening.findMany({
    where: {
      createdAt: { gte: since },
      prize: { type: { not: 'NO_PRIZE' } },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      prize: true,
      user: { select: { name: true, email: true } },
    },
  })
  const best = openings
    .slice()
    .sort((left, right) => {
      const scoreDiff = scoreOpening(right.prize) - scoreOpening(left.prize)
      if (scoreDiff !== 0) return scoreDiff
      return right.createdAt.getTime() - left.createdAt.getTime()
    })[0]

  if (!best) return null

  return {
    id: best.id,
    title: best.prize.title,
    label: prizeValueLabel(best.prize),
    rarity: best.prize.rarity,
    userLabel: best.user?.name?.trim() || maskEmail(best.user?.email) || 'Пользователь',
    createdAt: best.createdAt.toISOString(),
  }
}

function getCanOpenReason(input: {
  enabled: boolean
  attemptsCount: number
  prizesCount: number
  hasActiveSubscription: boolean
  welcomeAttemptsCount: number
}) {
  if (!input.enabled) return 'Подарочный бокс временно выключен'
  if (input.prizesCount <= 0) return 'Подарки ещё не настроены'
  if (input.attemptsCount <= 0) {
    return 'Нет доступных открытий. Их можно получить за покупку, приглашение или еженедельный бонус.'
  }
  if (!input.hasActiveSubscription && input.welcomeAttemptsCount <= 0) {
    return 'Нужна активная подписка. Приветственные открытия можно использовать без покупки.'
  }
  return null
}

function buildPityProgress(
  recentOpenings: Array<{ prize: { rarity: BonusBoxRarity } }>,
  config: { pityEnabled: boolean; pityOpenings: number }
) {
  const threshold = clamp(config.pityOpenings, 2, 100)
  const current = config.pityEnabled
    ? Math.min(openingsSinceRarityAtLeastFinite(recentOpenings, 1), threshold)
    : 0

  return {
    enabled: config.pityEnabled,
    threshold,
    current,
    remaining: config.pityEnabled ? Math.max(0, threshold - current) : null,
    guaranteedNext: config.pityEnabled && current >= threshold,
  }
}

function buildOpeningStreak(openingsCount: number) {
  const targets = [3, 5, 10]
  const nextTarget = targets.find((target) => openingsCount < target) ?? null

  return {
    current: nextTarget ? openingsCount : Math.min(openingsCount, targets[targets.length - 1]),
    nextTarget,
    targets,
    completed: targets.filter((target) => openingsCount >= target),
  }
}

function openingsSinceRarityAtLeastFinite(
  recentOpenings: Array<{ prize: { rarity: BonusBoxRarity } }>,
  minRank: number
) {
  const index = recentOpenings.findIndex((opening) => rarityRank(opening.prize.rarity) >= minRank)
  return index === -1 ? recentOpenings.length : index
}

function scoreOpening(prize: Pick<BonusBoxPrize, 'rarity' | 'type' | 'value'>) {
  const value = Math.max(0, prize.value)
  const typeScore =
    prize.type === 'SUBSCRIPTION_DAYS'
      ? value * 120
      : prize.type === 'TRAFFIC_GB'
        ? value * 70
        : prize.type === 'PROMO_CODE_PERCENT'
          ? value * 45
          : prize.type === 'BONUS_ATTEMPTS'
            ? value * 35
            : 0

  return rarityRank(prize.rarity) * 100_000 + typeScore
}

function prizeValueLabel(prize: Pick<BonusBoxPrize, 'type' | 'value'>) {
  if (prize.type === 'SUBSCRIPTION_DAYS') return `+${prize.value} дн.`
  if (prize.type === 'TRAFFIC_GB') return `+${prize.value} ГБ`
  if (prize.type === 'BONUS_ATTEMPTS') return `+${prize.value} открытий`
  if (prize.type === 'PROMO_CODE_PERCENT') return `-${prize.value}%`
  return 'Без начисления'
}

function maskEmail(email?: string | null) {
  if (!email) return null
  const [name, domain] = email.split('@')
  if (!domain) return name
  return `${name.slice(0, 2)}***@${domain}`
}

function getWeekKey(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function getCurrentWeeklyBonusDate(now: Date, weeklyDay: number) {
  const target = new Date(now)
  target.setHours(0, 0, 0, 0)
  const daysSinceBonusDay = (target.getDay() - weeklyDay + 7) % 7
  target.setDate(target.getDate() - daysSinceBonusDay)
  return target
}

function envBool(key: string, fallback: boolean) {
  const raw = process.env[key]?.trim().toLowerCase()
  if (!raw) return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw)
}

function envInt(key: string, fallback: number, min: number, max: number) {
  const raw = process.env[key]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return clamp(parsed, min, max)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
