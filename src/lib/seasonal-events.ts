import type { Prisma, SeasonalBonusEvent } from '@prisma/client'
import { getAppUrl } from './app-url'
import { grantEngagementBonusBoxAttempts } from './engagement-rewards'
import { notifyUser } from './notifications'
import { prisma } from './prisma'

type SeasonalEventSeed = Pick<
  SeasonalBonusEvent,
  'key' | 'enabled' | 'title' | 'description' | 'audience' | 'recurringWeekday' | 'notifyInApp' | 'notifyTelegram' | 'actionHref' | 'actionLabel' | 'bonusAttempts' | 'notificationCooldownHours'
>

export type SeasonalEventView = {
  key: string
  title: string
  description: string
  actionHref: string
  actionLabel: string
  bonusAttempts: number
  claimed: boolean
  promoCode: { code: string; discountPercent: number } | null
}

const DEFAULT_EVENTS: SeasonalEventSeed[] = [
  {
    key: 'TELEGRAM_DROP',
    enabled: true,
    title: 'Telegram Drop',
    description: 'Откройте кабинет в Telegram и заберите сезонный drop.',
    audience: 'ALL',
    recurringWeekday: null,
    notifyInApp: true,
    notifyTelegram: true,
    actionHref: '/dashboard/bonus-box',
    actionLabel: 'Открыть drop',
    bonusAttempts: 1,
    notificationCooldownHours: 24,
  },
  {
    key: 'COMEBACK_EVENT',
    enabled: true,
    title: 'Comeback Event',
    description: 'Для возвращения доступны подарки и персональные офферы.',
    audience: 'INACTIVE',
    recurringWeekday: null,
    notifyInApp: true,
    notifyTelegram: true,
    actionHref: '/dashboard/plans?bundle=COMEBACK_TODAY',
    actionLabel: 'Вернуться',
    bonusAttempts: 0,
    notificationCooldownHours: 24,
  },
  {
    key: 'WEEKEND_BOX',
    enabled: true,
    title: 'Weekend Box',
    description: 'Каждую пятницу доступно дополнительное открытие bonus box.',
    audience: 'ALL',
    recurringWeekday: 5,
    notifyInApp: true,
    notifyTelegram: true,
    actionHref: '/dashboard/bonus-box',
    actionLabel: 'Открыть box',
    bonusAttempts: 1,
    notificationCooldownHours: 24,
  },
]

export async function ensureSeasonalBonusEvents() {
  await Promise.all(
    DEFAULT_EVENTS.map((event) =>
      prisma.seasonalBonusEvent.upsert({
        where: { key: event.key },
        create: event,
        update: {
          title: event.title,
          description: event.description,
          audience: event.audience,
          recurringWeekday: event.recurringWeekday,
          notifyInApp: event.notifyInApp,
          notifyTelegram: event.notifyTelegram,
          actionHref: event.actionHref,
          actionLabel: event.actionLabel,
          bonusAttempts: event.bonusAttempts,
          notificationCooldownHours: event.notificationCooldownHours,
        },
      })
    )
  )
}

export async function getSeasonalEventsForUser(userId: string): Promise<SeasonalEventView[]> {
  const events = await getActiveSeasonalEvents()
  const eligible = []
  for (const event of events) {
    if (await isUserEligibleForSeasonalEvent(userId, event)) eligible.push(event)
  }
  const deliveries = await prisma.seasonalBonusEventDelivery.findMany({
    where: { userId, eventId: { in: eligible.map((event) => event.id) } },
    select: { eventId: true, claimedAt: true },
  })
  const deliveriesByEvent = new Map(deliveries.map((delivery) => [delivery.eventId, delivery]))

  return eligible.map((event) => ({
    key: event.key,
    title: event.title,
    description: event.description,
    actionHref: event.actionHref,
    actionLabel: event.actionLabel,
    bonusAttempts: event.bonusAttempts,
    claimed: Boolean(deliveriesByEvent.get(event.id)?.claimedAt),
    promoCode: event.promoCode?.isActive
      ? { code: event.promoCode.code, discountPercent: event.promoCode.discountPercent }
      : null,
  }))
}

export async function claimSeasonalEvent(userId: string, eventKey: string) {
  await ensureSeasonalBonusEvents()
  const event = await prisma.seasonalBonusEvent.findUnique({
    where: { key: eventKey },
    include: { promoCode: { select: { id: true, code: true, discountPercent: true, isActive: true } } },
  })
  if (!event || !isSeasonalEventActive(event)) {
    throw new SeasonalEventError('Событие недоступно', 404, 'EVENT_NOT_FOUND')
  }
  if (!(await isUserEligibleForSeasonalEvent(userId, event))) {
    throw new SeasonalEventError('Событие недоступно для аккаунта', 403, 'EVENT_NOT_ELIGIBLE')
  }

  return prisma.$transaction(async (tx) => {
    const delivery = await tx.seasonalBonusEventDelivery.upsert({
      where: { eventId_userId: { eventId: event.id, userId } },
      create: { eventId: event.id, userId },
      update: {},
    })
    if (delivery.claimedAt) {
      throw new SeasonalEventError('Подарок уже получен', 409, 'EVENT_ALREADY_CLAIMED')
    }

    const attempts = event.bonusAttempts > 0
      ? await grantEngagementBonusBoxAttempts({
          userId,
          source: 'SEASONAL_EVENT',
          sourceKeyPrefix: `${event.key}:${delivery.id}`,
          attemptsCount: event.bonusAttempts,
          tx,
        })
      : { granted: 0 }

    await tx.seasonalBonusEventDelivery.update({
      where: { id: delivery.id },
      data: {
        claimedAt: new Date(),
        attemptsGranted: attempts.granted,
        promoCodeId: event.promoCode?.isActive ? event.promoCode.id : null,
        metadata: {
          eventKey: event.key,
          promoCode: event.promoCode?.isActive ? event.promoCode.code : null,
        },
      },
    })

    return {
      ok: true as const,
      attemptsGranted: attempts.granted,
      promoCode: event.promoCode?.isActive
        ? { code: event.promoCode.code, discountPercent: event.promoCode.discountPercent }
        : null,
    }
  })
}

export async function runSeasonalEventNotifications() {
  await ensureSeasonalBonusEvents()
  const events = await getActiveSeasonalEvents()
  let sent = 0
  let skipped = 0

  for (const event of events) {
    const users = await findSeasonalAudience(event)
    for (const user of users) {
      const delivery = await prisma.seasonalBonusEventDelivery.upsert({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
        create: { eventId: event.id, userId: user.id },
        update: {},
      })
      if (!shouldNotify(delivery.notifiedAt, event.notificationCooldownHours)) {
        skipped += 1
        continue
      }

      await notifyUser({
        userId: user.id,
        type: 'SEASONAL_EVENT',
        dedupeKey: `seasonal:${event.key}:${dateKey(new Date())}:${user.id}`,
        title: event.title,
        body: event.description,
        actionHref: event.actionHref,
        actionLabel: event.actionLabel,
        inApp: event.notifyInApp,
        telegramText: event.notifyTelegram ? [`<b>${escapeTelegram(event.title)}</b>`, escapeTelegram(event.description)].join('\n') : undefined,
        telegramActionUrl: event.notifyTelegram ? `${getAppUrl()}${event.actionHref}` : undefined,
        telegramActionLabel: event.notifyTelegram ? event.actionLabel : undefined,
        telegramActionOpenInTelegram: event.notifyTelegram,
      })

      await prisma.seasonalBonusEventDelivery.update({
        where: { id: delivery.id },
        data: { notifiedAt: new Date() },
      })
      sent += 1
    }
  }

  return { sent, skipped }
}

async function getActiveSeasonalEvents() {
  await ensureSeasonalBonusEvents()
  const events = await prisma.seasonalBonusEvent.findMany({
    where: { enabled: true },
    include: { promoCode: { select: { id: true, code: true, discountPercent: true, isActive: true } } },
    orderBy: [{ createdAt: 'asc' }],
  })
  return events.filter(isSeasonalEventActive)
}

function isSeasonalEventActive(event: Pick<SeasonalBonusEvent, 'startsAt' | 'endsAt' | 'recurringWeekday'>) {
  const now = new Date()
  if (event.startsAt && event.startsAt > now) return false
  if (event.endsAt && event.endsAt < now) return false
  if (event.recurringWeekday != null && event.recurringWeekday !== now.getDay()) return false
  return true
}

async function isUserEligibleForSeasonalEvent(userId: string, event: Pick<SeasonalBonusEvent, 'audience'>) {
  if (event.audience === 'ALL') return true
  const now = new Date()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      telegramId: true,
      subscriptions: {
        where: { status: { in: ['ACTIVE', 'LIMITED'] } },
        orderBy: { expireAt: 'desc' },
        take: 1,
        select: { expireAt: true },
      },
      _count: { select: { subscriptions: true, payments: true } },
    },
  })
  if (!user) return false
  if (event.audience === 'TELEGRAM') return Boolean(user.telegramId)
  if (event.audience === 'ACTIVE') return Boolean(user.subscriptions[0]?.expireAt && user.subscriptions[0].expireAt > now)
  if (event.audience === 'INACTIVE') {
    return !user.subscriptions.some((subscription) => subscription.expireAt > now) && (user._count.subscriptions > 0 || user._count.payments > 0)
  }
  return true
}

async function findSeasonalAudience(event: SeasonalBonusEvent) {
  const now = new Date()
  const baseSelect = { id: true } satisfies Prisma.UserSelect
  if (event.audience === 'TELEGRAM') {
    return prisma.user.findMany({ where: { telegramId: { not: null } }, select: baseSelect, take: 1000 })
  }
  if (event.audience === 'ACTIVE') {
    return prisma.user.findMany({
      where: { subscriptions: { some: { status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gt: now } } } },
      select: baseSelect,
      take: 1000,
    })
  }
  if (event.audience === 'INACTIVE') {
    return prisma.user.findMany({
      where: {
        subscriptions: {
          some: {},
          none: { status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gt: now } },
        },
      },
      select: baseSelect,
      take: 1000,
    })
  }
  return prisma.user.findMany({ select: baseSelect, take: 1000 })
}

function shouldNotify(notifiedAt: Date | null, cooldownHours: number) {
  if (!notifiedAt) return true
  return Date.now() - notifiedAt.getTime() > Math.max(1, cooldownHours) * 60 * 60 * 1000
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function escapeTelegram(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export class SeasonalEventError extends Error {
  constructor(message: string, public status = 400, public code = 'SEASONAL_EVENT_ERROR') {
    super(message)
  }
}
