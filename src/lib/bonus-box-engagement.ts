import { createHash } from 'node:crypto'
import { Prisma, type BonusBoxMissionType, type BonusBoxPrize } from '@prisma/client'
import { prisma } from './prisma'
import { getClientIp } from './security'
import { notifyUser } from './notifications'

const DAY_MS = 24 * 60 * 60 * 1000
const RISK_WINDOW_MS = 30 * DAY_MS

export type BonusBoxMissionView = {
  id: string
  title: string
  description: string | null
  type: BonusBoxMissionType
  target: number
  value: number
  rewardAttempts: number
  completed: boolean
  claimed: boolean
  endsAt: string | null
}

export type BonusBoxEventView = {
  id: string
  title: string
  description: string | null
  endsAt: string
  attemptsPerUser: number
  weightMultiplier: number
  boostedPrizeTitles: string[]
  attemptsGranted: number
}

export class BonusBoxRiskError extends Error {
  constructor(
    message: string,
    public score: number
  ) {
    super(message)
    this.name = 'BonusBoxRiskError'
  }
}

export async function refreshBonusBoxEngagement(userId: string) {
  const [eventAttempts] = await Promise.all([
    grantActiveEventAttempts(userId),
    refreshBonusBoxMissionProgress(userId),
  ])
  return { eventAttempts }
}

export async function getBonusBoxEngagement(userId: string) {
  await refreshBonusBoxEngagement(userId)
  const now = new Date()
  const [missions, events, prizeRows] = await Promise.all([
    prisma.bonusBoxMission.findMany({
      where: activeDateRange(now),
      orderBy: [{ endsAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        progress: {
          where: { userId },
          take: 1,
        },
      },
    }),
    prisma.bonusBoxEvent.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      orderBy: { endsAt: 'asc' },
      include: {
        claims: {
          where: { userId },
          take: 1,
        },
      },
    }),
    prisma.bonusBoxPrize.findMany({
      select: { id: true, title: true },
    }),
  ])
  const prizeTitles = new Map(prizeRows.map((prize) => [prize.id, prize.title]))

  return {
    missions: missions.map<BonusBoxMissionView>((mission) => {
      const progress = mission.progress[0]
      return {
        id: mission.id,
        title: mission.title,
        description: mission.description,
        type: mission.type,
        target: mission.target,
        value: Math.min(mission.target, progress?.value ?? 0),
        rewardAttempts: mission.rewardAttempts,
        completed: Boolean(progress?.completedAt),
        claimed: Boolean(progress?.claimedAt),
        endsAt: mission.endsAt?.toISOString() ?? null,
      }
    }),
    events: events.map<BonusBoxEventView>((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      endsAt: event.endsAt.toISOString(),
      attemptsPerUser: event.attemptsPerUser,
      weightMultiplier: event.weightMultiplier,
      boostedPrizeTitles: event.prizeIds
        .map((id) => prizeTitles.get(id))
        .filter((title): title is string => Boolean(title)),
      attemptsGranted: event.claims[0]?.attemptsGranted ?? 0,
    })),
  }
}

export async function claimBonusBoxMission(userId: string, missionId: string) {
  await refreshBonusBoxMissionProgress(userId)
  const result = await prisma.$transaction(async (tx) => {
    const progress = await tx.bonusBoxMissionProgress.findUnique({
      where: { missionId_userId: { missionId, userId } },
      include: { mission: true },
    })
    const now = new Date()
    if (!progress || !isActiveAt(progress.mission, now)) {
      throw new Error('Задание недоступно')
    }
    if (!progress.completedAt || progress.value < progress.mission.target) {
      throw new Error('Задание ещё не выполнено')
    }
    if (progress.claimedAt) {
      throw new Error('Награда уже получена')
    }

    const claimed = await tx.bonusBoxMissionProgress.updateMany({
      where: { id: progress.id, claimedAt: null },
      data: { claimedAt: now },
    })
    if (claimed.count !== 1) throw new Error('Награда уже получена')

    await tx.bonusBoxAttempt.createMany({
      data: makeRewardAttempts({
        userId,
        source: 'MISSION',
        sourceKey: `mission:${missionId}`,
        count: progress.mission.rewardAttempts,
      }),
      skipDuplicates: true,
    })

    return {
      title: progress.mission.title,
      attempts: progress.mission.rewardAttempts,
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  await notifyUser({
    userId,
    type: 'BONUS_GRANTED',
    dedupeKey: `bonus-mission:${missionId}`,
    title: 'Задание выполнено',
    body: `${result.title}: начислено открытий ${result.attempts}.`,
    actionHref: '/dashboard/bonus-box',
    actionLabel: 'Открыть бонусы',
  }).catch(() => undefined)

  return result
}

export async function grantActiveEventAttempts(userId: string) {
  const now = new Date()
  const events = await prisma.bonusBoxEvent.findMany({
    where: {
      isActive: true,
      startsAt: { lte: now },
      attemptsPerUser: { gt: 0 },
      endsAt: { gt: now },
    },
    orderBy: { startsAt: 'asc' },
  })

  let granted = 0
  for (const event of events) {
    try {
      const count = await prisma.$transaction(async (tx) => {
        const existing = await tx.bonusBoxEventClaim.findUnique({
          where: { eventId_userId: { eventId: event.id, userId } },
          select: { id: true },
        })
        if (existing) return 0

        const reserved = await tx.bonusBoxEvent.updateMany({
          where: {
            id: event.id,
            isActive: true,
            startsAt: { lte: now },
            endsAt: { gt: now },
            ...(event.maxClaims == null ? {} : { claimsCount: { lt: event.maxClaims } }),
          },
          data: { claimsCount: { increment: 1 } },
        })
        if (reserved.count !== 1) return 0

        await tx.bonusBoxEventClaim.create({
          data: {
            eventId: event.id,
            userId,
            attemptsGranted: event.attemptsPerUser,
          },
        })
        await tx.bonusBoxAttempt.createMany({
          data: makeRewardAttempts({
            userId,
            source: 'SEASONAL_EVENT',
            sourceKey: `event:${event.id}`,
            count: event.attemptsPerUser,
          }),
          skipDuplicates: true,
        })
        return event.attemptsPerUser
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

      if (count > 0) {
        granted += count
        await notifyUser({
          userId,
          type: 'BONUS_GRANTED',
          dedupeKey: `bonus-event:${event.id}`,
          title: event.title,
          body: `Сезонное событие принесло открытий: ${count}.`,
          actionHref: '/dashboard/bonus-box',
          actionLabel: 'Открыть бонусы',
        }).catch(() => undefined)
      }
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error
      }
    }
  }
  return granted
}

export async function refreshBonusBoxMissionProgress(userId: string) {
  const now = new Date()
  const missions = await prisma.bonusBoxMission.findMany({
    where: activeDateRange(now),
    include: {
      progress: {
        where: { userId },
        take: 1,
      },
    },
  })
  if (missions.length === 0) return

  const earliestStart = missions.some((mission) => !mission.startsAt)
    ? null
    : missions.reduce<Date | null>((earliest, mission) => {
        if (!mission.startsAt) return earliest
        return !earliest || mission.startsAt < earliest ? mission.startsAt : earliest
      }, null)
  const [payments, referrals] = await Promise.all([
    prisma.payment.findMany({
      where: {
        userId,
        status: 'SUCCEEDED',
        ...(earliestStart ? { paidAt: { gte: earliestStart } } : {}),
      },
      select: { paidAt: true },
    }),
    prisma.referralReward.findMany({
      where: {
        referrerId: userId,
        ...(earliestStart ? { createdAt: { gte: earliestStart } } : {}),
      },
      select: { createdAt: true },
    }),
  ])

  for (const mission of missions) {
    const existing = mission.progress[0]
    let value = existing?.value ?? 0
    if (mission.type === 'PAYMENT_COUNT') {
      value = payments.filter((payment) => !mission.startsAt || (payment.paidAt && payment.paidAt >= mission.startsAt)).length
    } else if (mission.type === 'REFERRAL_COUNT') {
      value = referrals.filter((reward) => !mission.startsAt || reward.createdAt >= mission.startsAt).length
    } else {
      value = nextLoginStreak(existing?.value ?? 0, existing?.lastProgressAt ?? null, now)
    }
    value = Math.min(mission.target, value)
    const completedAt = existing?.completedAt ?? (value >= mission.target ? now : null)

    await prisma.bonusBoxMissionProgress.upsert({
      where: { missionId_userId: { missionId: mission.id, userId } },
      create: {
        missionId: mission.id,
        userId,
        value,
        lastProgressAt: mission.type === 'LOGIN_STREAK' ? now : null,
        completedAt,
      },
      update: {
        value,
        lastProgressAt: mission.type === 'LOGIN_STREAK' ? now : existing?.lastProgressAt,
        completedAt,
      },
    })
  }
}

export async function runBonusBoxLifecycleNotifications(userId: string) {
  const now = new Date()
  const soon = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const [attempts, promoOpenings] = await Promise.all([
    prisma.bonusBoxAttempt.findMany({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: now, lte: soon },
      },
      orderBy: { expiresAt: 'asc' },
      select: { expiresAt: true },
    }),
    prisma.bonusBoxOpening.findMany({
      where: {
        userId,
        promoCode: {
          isActive: true,
          expiresAt: { gt: now, lte: soon },
        },
      },
      include: { promoCode: true },
      take: 10,
    }),
  ])

  const tasks: Array<Promise<unknown>> = []
  const firstExpiry = attempts[0]?.expiresAt
  if (firstExpiry) {
    const day = firstExpiry.toISOString().slice(0, 10)
    tasks.push(notifyUser({
      userId,
      type: 'BONUS_GRANTED',
      dedupeKey: `bonus-attempts-expire:${day}`,
      title: 'Попытки скоро сгорят',
      body: `${attempts.length} открытий нужно использовать до ${formatShortDate(firstExpiry)}.`,
      actionHref: '/dashboard/bonus-box',
      actionLabel: 'Использовать',
      telegramText: `Попытки скоро сгорят. Доступно открытий: ${attempts.length}.`,
      emailDeliveryMode: 'fallback',
    }))
  }
  for (const opening of promoOpenings) {
    if (!opening.promoCode?.expiresAt) continue
    tasks.push(notifyUser({
      userId,
      type: 'BONUS_GRANTED',
      dedupeKey: `bonus-promo-expire:${opening.promoCode.id}`,
      title: 'Промокод скоро истечёт',
      body: `${opening.promoCode.code} действует до ${formatShortDate(opening.promoCode.expiresAt)}.`,
      actionHref: '/dashboard/plans',
      actionLabel: 'Выбрать тариф',
    }))
  }
  await Promise.allSettled(tasks)
}

export async function assessBonusBoxRisk(userId: string, req: Request) {
  const now = new Date()
  const signals: Array<{ kind: 'SHARED_FINGERPRINT' | 'SELF_REFERRAL' | 'EXCESSIVE_BALANCE'; keyHash: string; score: number; details: Prisma.InputJsonValue }> = []
  const ip = getClientIp(req)
  const userAgent = req.headers.get('user-agent')?.trim() ?? ''
  const fingerprint = ip
    ? createHash('sha256')
        .update(`${process.env.BONUS_BOX_RISK_SALT || process.env.JWT_SECRET || 'local'}:${ip}:${userAgent}`)
        .digest('hex')
    : null

  if (fingerprint) {
    const related = await prisma.bonusBoxRiskSignal.findMany({
      where: {
        kind: 'SHARED_FINGERPRINT',
        keyHash: fingerprint,
        createdAt: { gte: new Date(now.getTime() - RISK_WINDOW_MS) },
      },
      distinct: ['userId'],
      select: { userId: true },
    })
    const accountIds = new Set([userId, ...related.map((signal) => signal.userId)])
    const score = accountIds.size >= 3 ? Math.min(100, (accountIds.size - 1) * 25) : 0
    signals.push({
      kind: 'SHARED_FINGERPRINT',
      keyHash: fingerprint,
      score,
      details: { accountCount: accountIds.size },
    })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referredById: true },
    })
    if (user?.referredById && accountIds.has(user.referredById)) {
      signals.push({
        kind: 'SELF_REFERRAL',
        keyHash: fingerprint,
        score: 80,
        details: { referrerId: user.referredById },
      })
    }
  }

  const balance = await prisma.bonusBoxAttempt.count({
    where: {
      userId,
      usedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  })
  if (balance > 50) {
    signals.push({
      kind: 'EXCESSIVE_BALANCE',
      keyHash: `balance:${userId}`,
      score: Math.min(100, 50 + balance - 50),
      details: { balance },
    })
  }

  for (const signal of signals) {
    await prisma.bonusBoxRiskSignal.upsert({
      where: {
        userId_kind_keyHash: {
          userId,
          kind: signal.kind,
          keyHash: signal.keyHash,
        },
      },
      create: { userId, ...signal },
      update: {
        score: signal.score,
        details: signal.details,
        reviewedAt: signal.score > 0 ? null : undefined,
      },
    })
  }

  const score = signals.reduce((sum, signal) => sum + signal.score, 0)
  if (score >= 100) {
    throw new BonusBoxRiskError('Открытие временно остановлено для автоматической проверки', score)
  }
  return { score }
}

export function applyActiveEventWeights(
  prizes: BonusBoxPrize[],
  events: Array<{ id: string; prizeIds: string[]; weightMultiplier: number }>
) {
  return prizes.map((prize) => {
    let weight = prize.weight
    for (const event of events) {
      if (event.prizeIds.includes(prize.id)) {
        weight *= Math.max(1, event.weightMultiplier)
      }
    }
    return { ...prize, weight }
  })
}

export function activeEventForPrize(
  prizeId: string,
  events: Array<{ id: string; prizeIds: string[] }>
) {
  return events.find((event) => event.prizeIds.includes(prizeId))?.id ?? null
}

function activeDateRange(now: Date) {
  return {
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ],
  }
}

function isActiveAt(
  item: { isActive: boolean; startsAt: Date | null; endsAt: Date | null },
  now: Date
) {
  return item.isActive
    && (!item.startsAt || item.startsAt <= now)
    && (!item.endsAt || item.endsAt > now)
}

function nextLoginStreak(current: number, lastProgressAt: Date | null, now: Date) {
  if (!lastProgressAt) return 1
  const today = utcDay(now)
  const lastDay = utcDay(lastProgressAt)
  const difference = Math.round((today.getTime() - lastDay.getTime()) / DAY_MS)
  if (difference <= 0) return current
  return difference === 1 ? current + 1 : 1
}

function utcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function makeRewardAttempts(input: {
  userId: string
  source: 'MISSION' | 'SEASONAL_EVENT'
  sourceKey: string
  count: number
}) {
  return Array.from({ length: input.count }, (_, index) => ({
    userId: input.userId,
    source: input.source,
    sourceKey: `${input.sourceKey}:${index + 1}`,
    expiresAt: new Date(Date.now() + 30 * DAY_MS),
  }))
}

function formatShortDate(value: Date) {
  return value.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
  })
}
