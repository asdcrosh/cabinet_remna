// Бизнес-логика: создать/продлить подписку пользователя в Remnawave.
// Вызывается из:
//   - POST /api/payment/create (после успешного webhook'а ЮKassa)
//   - POST /api/admin/sync (для ручной синхронизации админом)
//
// ВАЖНО: эта функция идемпотентна. При повторном вызове с тем же
// набором аргументов состояние не должно «разъехаться».

import { prisma } from './prisma'
import { remnawave, RemnawaveError, type UserResponse } from './remnawave'
import { gbToBytes } from './format'
import { toRemnawaveTelegramId } from './telegram-remnawave'
import { readRemnawaveBigInt } from './remnawave-usage'

export interface EnsureSubscriptionInput {
  userId: string                  // локальный ID в нашей БД
  email: string                   // для Remnawave username
  paymentId?: string              // локальный Payment.id, если выдача идёт из webhook
  plan: {
    id: string
    name: string
    durationDays: number
    trafficLimitGb: number | null
    deviceLimit: number
    activeInternalSquads?: string[]
  }
}

/**
 * Создаёт (если нужно) профиль в Remnawave и продлевает/выдаёт подписку.
 * Локальную запись Subscription создаёт/обновляет по результату.
 */
export async function ensureRemnawaveSubscription(input: EnsureSubscriptionInput) {
  const activeInternalSquads = getPlanActiveInternalSquads(input.plan.activeInternalSquads)

  if (input.paymentId) {
    const payment = await prisma.payment.findUnique({
      where: { id: input.paymentId },
      include: { subscription: true },
    })
    if (payment?.subscriptionProvisionedAt && payment.subscription) {
      return { subscription: payment.subscription, remnawaveUser: null, isNew: false, idempotent: true }
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: {
      subscriptions: {
        where: { status: { in: ['ACTIVE', 'LIMITED'] } },
        orderBy: { expireAt: 'desc' },
        take: 1,
      },
    },
  })
  if (!user) throw new Error(`User ${input.userId} not found`)

  let remnawaveUser: UserResponse
  let isNew = false

  if (user.remnawaveUuid) {
    const activeSubscription = getLatestActiveSubscription(user.subscriptions)
    const newExpire = computeNewExpireAt(activeSubscription, input.plan)
    try {
      const updated = await remnawave.updateUser({
        uuid: user.remnawaveUuid,
        expireAt: newExpire.toISOString(),
        status: 'ACTIVE',
        // При продлении лимит обычно не меняется — но если у нового тарифа другой
        // (например, с безлимита переходим на 200 ГБ), обновим:
        trafficLimitBytes:
          input.plan.trafficLimitGb == null ? 0 : Number(gbToBytes(input.plan.trafficLimitGb)),
        hwidDeviceLimit: input.plan.deviceLimit,
        telegramId: toRemnawaveTelegramId(user.telegramId),
        tag: 'IMPORTED',
        ...(activeInternalSquads.length > 0 ? { activeInternalSquads } : {}),
      })
      remnawaveUser = updated.response
    } catch (e) {
      if (!(e instanceof RemnawaveError) || !isRemnawaveUserNotFound(e)) throw e

      // Локальная БД может ссылаться на профиль, который удалили в Remnawave вручную.
      // Восстанавливаем внешний профиль и перепривязываем локального пользователя.
      isNew = true
      const created = await createRemnawaveUser({
        localUserId: user.id,
        email: input.email,
        expireAt: newExpire,
        plan: input.plan,
        activeInternalSquads,
        telegramId: user.telegramId,
      })
      remnawaveUser = created.response

      await prisma.user.update({
        where: { id: user.id },
        data: {
          remnawaveUuid: remnawaveUser.uuid,
          remnawaveShortUuid: remnawaveUser.shortUuid,
          remnawaveUsername: remnawaveUser.username,
        },
      })
    }
  } else {
    // Создаём
    isNew = true
    const expireAt = new Date(Date.now() + input.plan.durationDays * 24 * 60 * 60 * 1000)
    const created = await createRemnawaveUser({
      localUserId: user.id,
      email: input.email,
      expireAt,
      plan: input.plan,
      activeInternalSquads,
      telegramId: user.telegramId,
    })
    remnawaveUser = created.response

    await prisma.user.update({
      where: { id: user.id },
      data: {
        remnawaveUuid: remnawaveUser.uuid,
        remnawaveShortUuid: remnawaveUser.shortUuid,
        remnawaveUsername: remnawaveUser.username,
      },
    })
  }

  // Денормализуем в нашу БД
  const trafficLimit = readRemnawaveBigInt(remnawaveUser, ['trafficLimitBytes', 'trafficLimit'])
  const trafficUsed = readRemnawaveBigInt(remnawaveUser, ['usedTrafficBytes', 'trafficUsedBytes'])
  const lifetimeUsed = readRemnawaveBigInt(remnawaveUser, [
    'lifetimeUsedTrafficBytes',
    'lifetimeTrafficUsedBytes',
  ])
  const latestSubscription = user.subscriptions[0]
  const isPlanSwitch = Boolean(latestSubscription && latestSubscription.planId !== input.plan.id)
  const subscription = await prisma.$transaction(async (tx) => {
    const row = latestSubscription
      ? await tx.subscription.update({
          where: { id: latestSubscription.id },
          data: {
            planId: input.plan.id,
            startAt: isPlanSwitch ? new Date() : undefined,
            expireAt: new Date(remnawaveUser.expireAt),
            status: mapStatus(remnawaveUser.status),
            trafficLimitBytes: trafficLimit === 0n ? null : trafficLimit,
            trafficUsedBytes: trafficUsed,
            lifetimeUsedBytes: lifetimeUsed,
            lastSyncedAt: new Date(),
            pendingSync: false,
          },
        })
      : await tx.subscription.create({
          data: {
            userId: user.id,
            planId: input.plan.id,
            startAt: new Date(),
            expireAt: new Date(remnawaveUser.expireAt),
            status: mapStatus(remnawaveUser.status),
            trafficLimitBytes: trafficLimit === 0n ? null : trafficLimit,
            trafficUsedBytes: trafficUsed,
            lifetimeUsedBytes: lifetimeUsed,
            lastSyncedAt: new Date(),
            pendingSync: false,
          },
        })

    if (input.paymentId) {
      await tx.payment.update({
        where: { id: input.paymentId },
        data: {
          subscriptionId: row.id,
          subscriptionProvisionedAt: new Date(),
          provisioningError: null,
        },
      })
    }

    return row
  })

  return { remnawaveUser, subscription, isNew, idempotent: false }
}

/**
 * При покупке того же тарифа продлеваем от текущей даты окончания.
 * При смене тарифа запускаем новый период от текущего момента.
 */
function computeNewExpireAt(
  active: { expireAt: Date; planId?: string | null } | undefined,
  plan: EnsureSubscriptionInput['plan']
) {
  const isSamePlan = active?.planId === plan.id
  const base = isSamePlan && active.expireAt.getTime() > Date.now() ? active.expireAt : new Date()
  return new Date(base.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)
}

function getLatestActiveSubscription(subscriptions: { expireAt: Date; status: string; planId?: string | null }[]) {
  return subscriptions
    .filter((s) => s.status === 'ACTIVE' || s.status === 'LIMITED')
    .sort((a, b) => b.expireAt.getTime() - a.expireAt.getTime())[0]
}

function mapStatus(s: UserResponse['status']) {
  switch (s) {
    case 'ACTIVE':
      return 'ACTIVE' as const
    case 'LIMITED':
      return 'LIMITED' as const
    case 'EXPIRED':
      return 'EXPIRED' as const
    case 'DISABLED':
      return 'DISABLED' as const
  }
}

/**
 * Из email делаем валидный username для Remnawave.
 * Требование: ^[a-zA-Z0-9_-]+$, 3-36.
 */
function sanitizeUsername(email: string): string {
  const base = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_')
  const short = base.slice(0, 28)
  // Добавим 6 случайных символов, чтобы username был уникален
  const rand = Math.random().toString(36).slice(2, 8)
  return `${short}_${rand}`.slice(0, 36)
}

function createRemnawaveUser(input: {
  localUserId: string
  email: string
  expireAt: Date
  plan: EnsureSubscriptionInput['plan']
  activeInternalSquads: string[]
  telegramId?: bigint | null
}) {
  return remnawave.createUser({
    username: sanitizeUsername(input.email),
    expireAt: input.expireAt.toISOString(),
    status: 'ACTIVE',
    email: input.email,
    telegramId: toRemnawaveTelegramId(input.telegramId),
    tag: 'IMPORTED',
    trafficLimitBytes:
      input.plan.trafficLimitGb == null ? 0 : Number(gbToBytes(input.plan.trafficLimitGb)),
    hwidDeviceLimit: input.plan.deviceLimit,
    ...(input.activeInternalSquads.length > 0 ? { activeInternalSquads: input.activeInternalSquads } : {}),
    // По умолчанию — месячный сброс. Если в Remnawave вы настроили
    // свою стратегию — поменяйте здесь.
    trafficLimitStrategy: 'MONTH',
    description: `Created by cabinet: ${input.localUserId}`,
  })
}

function isRemnawaveUserNotFound(error: RemnawaveError) {
  if (error.status === 404) return true
  const body = error.body
  return (
    typeof body === 'object' &&
    body !== null &&
    'errorCode' in body &&
    body.errorCode === 'A025'
  )
}

function getPlanActiveInternalSquads(planSquads: string[] | undefined) {
  if (planSquads && planSquads.length > 0) return planSquads
  return getDefaultActiveInternalSquads()
}

function getDefaultActiveInternalSquads() {
  return (process.env.REMNAWAVE_INTERNAL_SQUAD_UUIDS || process.env.REMNAWAVE_INTERNAL_SQUAD_UUID || '')
    .split(',')
    .map((uuid) => uuid.trim())
    .filter(Boolean)
}

export { RemnawaveError }
