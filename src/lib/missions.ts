import { randomBytes } from 'node:crypto'
import { Prisma, type MissionDefinition, type MissionRewardType } from '@prisma/client'
import { prisma } from './prisma'
import { notifyUser } from './notifications'
import { getAppUrl } from './app-url'
import { getBrandName } from './branding'
import { logError, logWarn } from './logger'

export const MISSION_KEYS = {
  TELEGRAM_WEBAPP_STREAK: 'TELEGRAM_WEBAPP_3_DAY_STREAK',
  LINK_TELEGRAM: 'LINK_TELEGRAM',
  EARLY_RENEWAL: 'EARLY_RENEWAL',
  FIRST_DEVICE: 'FIRST_DEVICE',
} as const

export type MissionKey = (typeof MISSION_KEYS)[keyof typeof MISSION_KEYS]

type MissionSeed = {
  key: MissionKey
  title: string
  description: string
  goal: number
  rewardType: MissionRewardType
  rewardValue: number
  rewardConfig?: Prisma.InputJsonValue
  sortOrder: number
}

export type UserMissionView = {
  key: string
  title: string
  description: string
  progress: number
  goal: number
  completed: boolean
  claimed: boolean
  reward: {
    type: MissionRewardType
    value: number
    label: string
    metadata: Prisma.JsonValue | null
  }
}

const TELEGRAM_OPEN_EVENT = 'TELEGRAM_WEBAPP_OPEN'
const EARLY_RENEWAL_EVENT = 'EARLY_RENEWAL'
const MISSION_PROMO_EXPIRES_DAYS = 14

const DEFAULT_MISSIONS: MissionSeed[] = [
  {
    key: MISSION_KEYS.TELEGRAM_WEBAPP_STREAK,
    title: 'Открой кабинет 3 дня подряд',
    description: 'Заходите в Telegram WebApp три дня подряд и заберите открытие bonus box.',
    goal: 3,
    rewardType: 'BONUS_BOX_ATTEMPTS',
    rewardValue: 1,
    sortOrder: 10,
  },
  {
    key: MISSION_KEYS.LINK_TELEGRAM,
    title: 'Привяжи Telegram',
    description: 'Привяжите Telegram к кабинету и получите персональный промокод -10%.',
    goal: 1,
    rewardType: 'PROMO_CODE_PERCENT',
    rewardValue: 10,
    sortOrder: 20,
  },
  {
    key: MISSION_KEYS.EARLY_RENEWAL,
    title: 'Продли подписку заранее',
    description: 'Продлите активную подписку заранее: 30 дней дают 3 открытия, 90 дней дают 6.',
    goal: 1,
    rewardType: 'BONUS_BOX_ATTEMPTS',
    rewardValue: 3,
    rewardConfig: {
      thresholds: [
        { durationDays: 90, attempts: 6 },
        { durationDays: 30, attempts: 3 },
      ],
    },
    sortOrder: 30,
  },
  {
    key: MISSION_KEYS.FIRST_DEVICE,
    title: 'Первое подключение',
    description: 'Подключите первое устройство и получите 1 открытие bonus box.',
    goal: 1,
    rewardType: 'BONUS_BOX_ATTEMPTS',
    rewardValue: 1,
    sortOrder: 40,
  },
]

export async function ensureMissionDefinitions() {
  await Promise.all(
    DEFAULT_MISSIONS.map((mission) =>
      prisma.missionDefinition.upsert({
        where: { key: mission.key },
        create: mission,
        update: {
          title: mission.title,
          description: mission.description,
          goal: mission.goal,
          rewardType: mission.rewardType,
          rewardValue: mission.rewardValue,
          rewardConfig: mission.rewardConfig ?? Prisma.DbNull,
          sortOrder: mission.sortOrder,
        },
      })
    )
  )
}

export async function getUserMissions(userId: string): Promise<UserMissionView[]> {
  const definitions = await loadMissionDefinitions()
  await refreshUserMissionProgress(userId, definitions)

  const progressRows = await prisma.userMissionProgress.findMany({
    where: { userId, missionId: { in: definitions.map((mission) => mission.id) } },
    include: { mission: true },
  })
  const progressByMission = new Map(progressRows.map((row) => [row.missionId, row]))

  return definitions.map((mission) => {
    const progress = progressByMission.get(mission.id)
    const rewardMetadata = progress?.rewardMetadata ?? null
    const rewardValue = mission.key === MISSION_KEYS.EARLY_RENEWAL
      ? readRewardAttempts(rewardMetadata) ?? mission.rewardValue
      : mission.rewardValue

    return {
      key: mission.key,
      title: mission.title,
      description: mission.description,
      progress: progress?.progress ?? 0,
      goal: progress?.goal ?? mission.goal,
      completed: Boolean(progress?.completedAt),
      claimed: Boolean(progress?.claimedAt),
      reward: {
        type: mission.rewardType,
        value: rewardValue,
        label: mission.rewardType === 'PROMO_CODE_PERCENT'
          ? `Промокод -${rewardValue}%`
          : `${rewardValue} открытий bonus box`,
        metadata: rewardMetadata,
      },
    }
  })
}

export async function claimMissionReward(userId: string, missionKey: string) {
  const definitions = await loadMissionDefinitions()
  await refreshUserMissionProgress(userId, definitions)

  const progress = await prisma.userMissionProgress.findFirst({
    where: { userId, mission: { key: missionKey, isActive: true } },
    include: { mission: true, user: { select: { email: true, name: true } } },
  })

  if (!progress || !progress.completedAt) {
    throw new MissionError('Миссия ещё не выполнена', 400, 'MISSION_NOT_COMPLETED')
  }
  if (progress.claimedAt) {
    throw new MissionError('Награда уже получена', 409, 'MISSION_ALREADY_CLAIMED')
  }

  if (progress.mission.rewardType === 'PROMO_CODE_PERCENT') {
    const promoCode = await createMissionPromoCode({
      userId,
      email: progress.user.email,
      missionKey: progress.mission.key,
      discountPercent: progress.mission.rewardValue,
    })
    const rewardMetadata = {
      type: 'PROMO_CODE',
      promoCodeId: promoCode.id,
      code: promoCode.code,
      discountPercent: promoCode.discountPercent,
      expiresAt: promoCode.expiresAt?.toISOString() ?? null,
    }
    await prisma.userMissionProgress.update({
      where: { id: progress.id },
      data: { claimedAt: new Date(), rewardMetadata },
    })
    return { ok: true as const, reward: rewardMetadata }
  }

  const attemptsCount = progress.mission.key === MISSION_KEYS.EARLY_RENEWAL
    ? readRewardAttempts(progress.rewardMetadata) ?? progress.mission.rewardValue
    : progress.mission.rewardValue

  const result = await grantMissionBonusBoxAttempts({
    userId,
    missionKey: progress.mission.key,
    progressId: progress.id,
    attemptsCount,
  })
  const rewardMetadata = {
    type: 'BONUS_BOX_ATTEMPTS',
    attemptsCount: result.granted,
  }

  await prisma.userMissionProgress.update({
    where: { id: progress.id },
    data: { claimedAt: new Date(), rewardMetadata },
  })

  return { ok: true as const, reward: rewardMetadata }
}

export async function recordTelegramWebAppOpen(userId: string) {
  await recordEngagementEvent({
    userId,
    type: TELEGRAM_OPEN_EVENT,
    eventKey: dateKey(new Date()),
  })
}

export async function recordEarlyRenewalMissionForPayment(input: {
  paymentId: string
  userId: string
  hadActiveSubscriptionBefore: boolean
}) {
  if (!input.hadActiveSubscriptionBefore) return { recorded: false, reason: 'not_early' as const }

  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    select: {
      id: true,
      userId: true,
      status: true,
      amountKopecks: true,
      subscriptionProvisionedAt: true,
      plan: { select: { durationDays: true } },
    },
  })

  if (
    !payment ||
    payment.userId !== input.userId ||
    payment.status !== 'SUCCEEDED' ||
    !payment.subscriptionProvisionedAt ||
    payment.amountKopecks <= 0
  ) {
    return { recorded: false, reason: 'payment_not_eligible' as const }
  }

  const attempts = getEarlyRenewalAttempts(payment.plan.durationDays)
  if (attempts <= 0) return { recorded: false, reason: 'duration_not_eligible' as const }

  await recordEngagementEvent({
    userId: input.userId,
    type: EARLY_RENEWAL_EVENT,
    eventKey: `payment:${payment.id}`,
    metadata: {
      paymentId: payment.id,
      durationDays: payment.plan.durationDays,
      attempts,
    },
  })

  return { recorded: true as const, attempts }
}

async function loadMissionDefinitions() {
  await ensureMissionDefinitions()
  return prisma.missionDefinition.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
}

async function refreshUserMissionProgress(userId: string, definitions: MissionDefinition[]) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      telegramId: true,
      _count: { select: { devices: true } },
    },
  })
  if (!user) return

  const [telegramStreak, earlyRenewalEvent] = await Promise.all([
    getTelegramWebAppStreak(userId),
    prisma.userEngagementEvent.findFirst({
      where: { userId, type: EARLY_RENEWAL_EVENT },
      orderBy: { occurredAt: 'desc' },
    }),
  ])

  await Promise.all(
    definitions.map(async (mission) => {
      const state = getMissionState({
        mission,
        telegramLinked: Boolean(user.telegramId),
        deviceCount: user._count.devices,
        telegramStreak,
        earlyRenewalEvent,
      })
      await upsertMissionProgress(userId, mission, state.progress, state.rewardMetadata)
    })
  )
}

async function upsertMissionProgress(
  userId: string,
  mission: MissionDefinition,
  progressValue: number,
  rewardMetadata?: Prisma.InputJsonValue
) {
  const progress = Math.max(0, Math.min(progressValue, mission.goal))
  const existing = await prisma.userMissionProgress.findUnique({
    where: { userId_missionId: { userId, missionId: mission.id } },
    select: { id: true, completedAt: true, claimedAt: true },
  })
  const completedAt = progress >= mission.goal ? existing?.completedAt ?? new Date() : null

  const row = await prisma.userMissionProgress.upsert({
    where: { userId_missionId: { userId, missionId: mission.id } },
    create: {
      userId,
      missionId: mission.id,
      progress,
      goal: mission.goal,
      completedAt,
      rewardMetadata,
    },
    update: {
      progress,
      goal: mission.goal,
      completedAt: existing?.completedAt ?? completedAt,
      rewardMetadata: existing?.claimedAt ? undefined : rewardMetadata,
    },
  })

  if (!existing?.completedAt && row.completedAt) {
    await notifyMissionCompleted(userId, mission).catch((error) => {
      logWarn('missions.notify_completed_failed', {
        userId,
        missionKey: mission.key,
        message: error instanceof Error ? error.message : 'unknown error',
      })
    })
  }
}

function getMissionState(input: {
  mission: MissionDefinition
  telegramLinked: boolean
  deviceCount: number
  telegramStreak: number
  earlyRenewalEvent: { metadata: Prisma.JsonValue } | null
}) {
  switch (input.mission.key) {
    case MISSION_KEYS.TELEGRAM_WEBAPP_STREAK:
      return { progress: input.telegramStreak }
    case MISSION_KEYS.LINK_TELEGRAM:
      return { progress: input.telegramLinked ? 1 : 0 }
    case MISSION_KEYS.FIRST_DEVICE:
      return { progress: input.deviceCount > 0 ? 1 : 0 }
    case MISSION_KEYS.EARLY_RENEWAL:
      return {
        progress: input.earlyRenewalEvent ? 1 : 0,
        rewardMetadata: input.earlyRenewalEvent?.metadata as Prisma.InputJsonValue | undefined,
      }
    default:
      return { progress: 0 }
  }
}

async function getTelegramWebAppStreak(userId: string) {
  const events = await prisma.userEngagementEvent.findMany({
    where: { userId, type: TELEGRAM_OPEN_EVENT },
    select: { eventKey: true },
    orderBy: { occurredAt: 'desc' },
    take: 21,
  })
  const keys = new Set(events.map((event) => event.eventKey))
  let cursor = dateKey(new Date())
  let streak = 0

  while (keys.has(cursor)) {
    streak += 1
    cursor = previousDateKey(cursor)
  }

  return streak
}

async function recordEngagementEvent(input: {
  userId: string
  type: string
  eventKey: string
  metadata?: Prisma.InputJsonValue
}) {
  await prisma.userEngagementEvent.upsert({
    where: {
      userId_type_eventKey: {
        userId: input.userId,
        type: input.type,
        eventKey: input.eventKey,
      },
    },
    create: {
      userId: input.userId,
      type: input.type,
      eventKey: input.eventKey,
      metadata: input.metadata,
    },
    update: {
      occurredAt: new Date(),
      metadata: input.metadata,
    },
  })
}

async function grantMissionBonusBoxAttempts(input: {
  userId: string
  missionKey: string
  progressId: string
  attemptsCount: number
}) {
  const attemptsCount = Math.max(1, Math.min(20, input.attemptsCount))
  const sourceKeyPrefix = `${input.missionKey}:${input.progressId}`
  const result = await prisma.bonusBoxAttempt.createMany({
    data: Array.from({ length: attemptsCount }, (_, index) => ({
      userId: input.userId,
      source: 'MISSION',
      sourceKey: `${sourceKeyPrefix}:${index + 1}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })),
    skipDuplicates: true,
  })

  return { granted: result.count }
}

async function createMissionPromoCode(input: {
  userId: string
  email: string
  missionKey: string
  discountPercent: number
}) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `TG-${randomBytes(4).toString('hex').toUpperCase()}`
    try {
      return await prisma.promoCode.create({
        data: {
          code,
          discountPercent: input.discountPercent,
          audience: 'PERSONAL',
          allowedEmails: [input.email.trim().toLowerCase()],
          isActive: true,
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + MISSION_PROMO_EXPIRES_DAYS * 24 * 60 * 60 * 1000),
          maxUses: 1,
          maxUsesPerUser: 1,
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue
      logError('missions.promo_create_failed', error, {
        userId: input.userId,
        missionKey: input.missionKey,
      })
      throw error
    }
  }

  throw new Error('Failed to generate unique mission promo code')
}

async function notifyMissionCompleted(userId: string, mission: MissionDefinition) {
  const body = `Миссия «${mission.title}» выполнена. Награда ждёт вас в кабинете.`
  await notifyUser({
    userId,
    type: 'MISSION_COMPLETED',
    dedupeKey: `mission-completed:${mission.key}`,
    title: 'Миссия выполнена',
    body,
    actionHref: '/dashboard',
    actionLabel: 'Забрать награду',
    telegramText: [`<b>Миссия выполнена</b>`, escapeTelegram(body)].join('\n'),
    telegramActionUrl: `${getAppUrl()}/dashboard`,
    telegramActionLabel: 'Забрать награду',
    telegramActionOpenInTelegram: true,
    emailSubject: `Миссия выполнена — ${getBrandName()}`,
    emailText: `${body}\n\nЗабрать награду: ${getAppUrl()}/dashboard`,
  })
}

function getEarlyRenewalAttempts(durationDays: number) {
  if (durationDays >= 90) return 6
  if (durationDays >= 30) return 3
  return 0
}

function readRewardAttempts(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const attempts = metadata.attempts ?? metadata.attemptsCount
  return typeof attempts === 'number' && Number.isFinite(attempts) ? attempts : null
}

function dateKey(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date)
}

function previousDateKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function escapeTelegram(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export class MissionError extends Error {
  constructor(message: string, public status = 400, public code = 'MISSION_ERROR') {
    super(message)
  }
}
