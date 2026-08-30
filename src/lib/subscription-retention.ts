import type { RetentionReason } from '@prisma/client'
import { disableAutoRenewal } from './auto-renewal'
import { getAppUrl } from './app-url'
import { logError, logInfo } from './logger'
import { notifyUser } from './notifications'
import { prisma } from './prisma'
import { hasRemnawaveUserReference, remnawave, remnawaveUserReference } from './remnawave'
import { resolvePlanActiveInternalSquads } from './subscription'
import {
  getResumedWhitelistAddonExpireAt,
  getWhitelistAddonRemainingSeconds,
} from './whitelist-addon-policy'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_PAUSE_DAYS = 30

export async function getRetentionState(userId: string) {
  const pause = await prisma.subscriptionRetention.findFirst({
    where: { userId, status: 'PAUSED', action: 'SUBSCRIPTION_PAUSED' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      reason: true,
      comment: true,
      pauseUntil: true,
      createdAt: true,
      subscription: { select: { id: true, plan: { select: { name: true } } } },
    },
  })
  return pause
}

export async function recordAutoRenewalCancellation(input: {
  userId: string
  reason: RetentionReason
  comment?: string | null
}) {
  const subscription = await prisma.subscription.findFirst({
    where: { userId: input.userId },
    orderBy: { expireAt: 'desc' },
    select: { id: true },
  })
  await disableAutoRenewal(input.userId)
  return prisma.subscriptionRetention.create({
    data: {
      userId: input.userId,
      subscriptionId: subscription?.id ?? null,
      reason: input.reason,
      action: 'AUTO_RENEWAL_DISABLED',
      status: 'CLOSED',
      comment: cleanComment(input.comment),
    },
  })
}

export async function pauseSubscription(input: {
  userId: string
  reason: RetentionReason
  pauseDays: number
  comment?: string | null
}) {
  const pauseDays = Math.min(Math.max(Math.trunc(input.pauseDays), 1), MAX_PAUSE_DAYS)
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: {
      subscriptions: {
        where: { status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gt: new Date() } },
        orderBy: { expireAt: 'desc' },
        take: 1,
        include: { plan: { select: { name: true } } },
      },
    },
  })
  const subscription = user?.subscriptions[0]
  if (!user || !subscription || !hasRemnawaveUserReference(user)) {
    throw new RetentionError('Активная подписка для паузы не найдена', 409)
  }
  const activePause = await prisma.subscriptionRetention.findFirst({
    where: { userId: input.userId, status: 'PAUSED' },
    select: { id: true },
  })
  if (activePause) throw new RetentionError('Подписка уже приостановлена', 409)

  const now = new Date()
  const remainingSeconds = BigInt(Math.max(1, Math.ceil((subscription.expireAt.getTime() - now.getTime()) / 1000)))
  const whitelistAddonRemainingSeconds = subscription.whitelistAddonActive
    ? getWhitelistAddonRemainingSeconds(subscription.whitelistAddonExpireAt, now)
    : subscription.whitelistAddonRemainingSeconds ?? 0n
  const pauseUntil = new Date(now.getTime() + pauseDays * DAY_MS)

  await remnawave.disableUser(remnawaveUserReference(user))
  try {
    const retention = await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'PAUSED',
          pendingSync: false,
          ...(whitelistAddonRemainingSeconds > 0n
            ? {
                whitelistAddonActive: false,
                whitelistAddonExpireAt: null,
                whitelistAddonPausedAt: now,
                whitelistAddonRemainingSeconds,
              }
            : {}),
        },
      })
      return tx.subscriptionRetention.create({
        data: {
          userId: user.id,
          subscriptionId: subscription.id,
          reason: input.reason,
          action: 'SUBSCRIPTION_PAUSED',
          status: 'PAUSED',
          comment: cleanComment(input.comment),
          remainingSeconds,
          pauseUntil,
        },
      })
    })
    await disableAutoRenewal(user.id)
    await notifyPause(user.id, subscription.plan?.name ?? 'Подписка', pauseUntil, retention.id)
    logInfo('subscription_retention.paused', { userId: user.id, subscriptionId: subscription.id, pauseUntil })
    return retention
  } catch (error) {
    await remnawave.enableUser(remnawaveUserReference(user)).catch((rollbackError) => {
      logError('subscription_retention.pause_rollback_failed', rollbackError, { userId: user.id })
    })
    throw error
  }
}

export async function resumeSubscription(userId: string, source: 'USER' | 'WORKER' = 'USER') {
  const pause = await prisma.subscriptionRetention.findFirst({
    where: { userId, status: 'PAUSED', action: 'SUBSCRIPTION_PAUSED' },
    orderBy: { createdAt: 'desc' },
    include: {
      user: true,
      subscription: {
        include: {
          plan: { select: { name: true, activeInternalSquads: true } },
        },
      },
    },
  })
  if (!pause?.subscription || !hasRemnawaveUserReference(pause.user)) {
    if (source === 'WORKER') return null
    throw new RetentionError('Активная пауза не найдена', 409)
  }

  const remainingMs = Number(pause.remainingSeconds ?? 1n) * 1000
  const expireAt = new Date(Date.now() + Math.max(remainingMs, 1000))
  const now = new Date()
  const whitelistAddonRemainingSeconds = pause.subscription.whitelistAddonRemainingSeconds ?? 0n
  const whitelistAddonExpireAt = whitelistAddonRemainingSeconds > 0n
    ? getResumedWhitelistAddonExpireAt(now, whitelistAddonRemainingSeconds)
    : null
  const reference = remnawaveUserReference(pause.user)
  await remnawave.updateUser(reference, {
    expireAt: expireAt.toISOString(),
    ...(whitelistAddonExpireAt
      ? {
          activeInternalSquads: Array.from(new Set([
            ...resolvePlanActiveInternalSquads(pause.subscription.plan?.activeInternalSquads),
            ...pause.subscription.whitelistAddonInternalSquads,
          ])),
        }
      : {}),
  })
  await remnawave.enableUser(reference)

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: pause.subscription.id },
      data: {
        status: 'ACTIVE',
        expireAt,
        lastSyncedAt: now,
        pendingSync: false,
        ...(whitelistAddonExpireAt
          ? {
              whitelistAddonActive: true,
              whitelistAddonExpireAt,
              whitelistAddonPausedAt: null,
              whitelistAddonRemainingSeconds: null,
            }
          : {}),
      },
    }),
    prisma.subscriptionRetention.update({
      where: { id: pause.id },
      data: { status: 'RESUMED', resumedAt: now },
    }),
    prisma.subscriptionRetention.create({
      data: {
        userId,
        subscriptionId: pause.subscription.id,
        reason: pause.reason,
        action: 'SUBSCRIPTION_RESUMED',
        status: 'CLOSED',
        comment: source === 'WORKER' ? 'Автоматическое возобновление по окончании паузы' : 'Возобновлено пользователем',
      },
    }),
  ])
  await notifyResume(userId, pause.subscription.plan?.name ?? 'Подписка', expireAt, pause.id)
  logInfo('subscription_retention.resumed', { userId, subscriptionId: pause.subscription.id, source, expireAt })
  return { expireAt }
}

export async function resumeDuePausedSubscriptions(input: {
  limit?: number
  shouldStop?: () => boolean
} = {}) {
  const due = await prisma.subscriptionRetention.findMany({
    where: { status: 'PAUSED', action: 'SUBSCRIPTION_PAUSED', pauseUntil: { lte: new Date() } },
    orderBy: { pauseUntil: 'asc' },
    take: Math.min(Math.max(input.limit ?? 20, 1), 100),
    select: { userId: true },
  })
  const result = { checked: due.length, resumed: 0, failed: 0 }
  for (const item of due) {
    if (input.shouldStop?.()) break
    try {
      if (await resumeSubscription(item.userId, 'WORKER')) result.resumed += 1
    } catch (error) {
      result.failed += 1
      logError('subscription_retention.auto_resume_failed', error, { userId: item.userId })
    }
  }
  return result
}

async function notifyPause(userId: string, planName: string, pauseUntil: Date, id: string) {
  const date = formatDate(pauseUntil)
  await notifyUser({
    userId,
    type: 'SUBSCRIPTION_PAUSED',
    dedupeKey: `subscription-paused:${id}`,
    title: 'Доступ приостановлен',
    body: `Остаток тарифа «${planName}» сохранён. Доступ включится ${date} или раньше вручную.`,
    actionHref: '/dashboard/billing',
    actionLabel: 'Управлять паузой',
    telegramText: `<b>Доступ приостановлен</b>\nОстаток тарифа «${planName}» сохранён. Автоматическое включение: ${date}.`,
    telegramActionUrl: `${getAppUrl()}/dashboard/billing`,
    telegramActionLabel: 'Управлять паузой',
    telegramActionOpenInTelegram: true,
  })
}

async function notifyResume(userId: string, planName: string, expireAt: Date, id: string) {
  const date = formatDate(expireAt)
  await notifyUser({
    userId,
    type: 'SUBSCRIPTION_RESUMED',
    dedupeKey: `subscription-resumed:${id}`,
    title: 'Доступ снова активен',
    body: `Тариф «${planName}» возобновлён и действует до ${date}.`,
    actionHref: '/dashboard/subscription',
    actionLabel: 'Открыть подключение',
    telegramText: `<b>Доступ снова активен</b>\nТариф «${planName}» действует до ${date}.`,
    telegramActionUrl: `${getAppUrl()}/dashboard/subscription`,
    telegramActionLabel: 'Открыть подключение',
    telegramActionOpenInTelegram: true,
  })
}

function cleanComment(value?: string | null) {
  const comment = value?.trim().slice(0, 500)
  return comment || null
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(value)
}

export class RetentionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}
