// Бизнес-логика: создать/продлить подписку пользователя в Remnawave.
// Вызывается из:
//   - POST /api/payment/create (после успешного webhook'а ЮKassa)
//   - POST /api/admin/sync (для ручной синхронизации админом)
//
// ВАЖНО: эта функция идемпотентна. При повторном вызове с тем же
// набором аргументов состояние не должно «разъехаться».

import { prisma } from './prisma'
import {
  hasRemnawaveUserReference,
  remnawave,
  RemnawaveError,
  remnawaveUserReference,
  type UserResponse,
} from './remnawave'
import { gbToBytes } from './format'
import { toRemnawaveTelegramId } from './telegram-remnawave'
import { readRemnawaveBigInt } from './remnawave-usage'
import {
  getWhitelistAddonExpireAt,
  getResumedWhitelistAddonExpireAt,
  getWhitelistAddonPauseAt,
  getWhitelistAddonRemainingSeconds,
  hasWhitelistAddonEntitlement,
  isWhitelistAddonCurrentlyActive,
} from './whitelist-addon-policy'

export interface EnsureSubscriptionInput {
  userId: string                  // локальный ID в нашей БД
  email: string                   // для Remnawave username
  paymentId?: string              // локальный Payment.id, если выдача идёт из webhook
  periodMode?: 'AUTO' | 'REPLACE' | 'EXTEND'
  whitelistAddon?: {
    internalSquads: string[]
    activatedAt?: Date
  }
  plan: {
    id: string
    name: string
    durationDays: number
    unlimitedDuration?: boolean
    trafficLimitGb: number | null
    deviceLimit: number
    unlimitedDevices?: boolean
    activeInternalSquads?: string[]
  }
}

/**
 * Создаёт (если нужно) профиль в Remnawave и продлевает/выдаёт подписку.
 * Локальную запись Subscription создаёт/обновляет по результату.
 */
export async function ensureRemnawaveSubscription(input: EnsureSubscriptionInput) {
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
        where: {
          OR: [
            { status: { in: ['ACTIVE', 'LIMITED'] } },
            { whitelistAddonActive: true },
            { whitelistAddonRemainingSeconds: { gt: 0n } },
          ],
        },
        orderBy: { expireAt: 'desc' },
        include: { plan: true },
      },
    },
  })
  if (!user) throw new Error(`User ${input.userId} not found`)

  const now = new Date()
  const latestSubscription = getLatestActiveSubscription(user.subscriptions)
  const isPlanSwitch = Boolean(latestSubscription && latestSubscription.planId !== input.plan.id)
  const whitelistAddonSource = user.subscriptions.find((subscription) =>
    hasWhitelistAddonEntitlement(subscription, now)
  )
  const whitelistAddonState = resolveWhitelistAddonForActivation({
    source: whitelistAddonSource,
    requested: input.whitelistAddon,
    paymentId: input.paymentId,
    now,
  })
  const {
    active: whitelistAddonActive,
    activatedAt: whitelistAddonActivatedAt,
    expireAt: whitelistAddonExpireAt,
    paymentId: whitelistAddonPaymentId,
    squads: whitelistAddonSquads,
  } = whitelistAddonState
  const activeInternalSquads = Array.from(new Set([
    ...resolvePlanActiveInternalSquads(input.plan.activeInternalSquads),
    ...whitelistAddonSquads,
  ]))

  let remnawaveUser: UserResponse
  let isNew = false

  if (hasRemnawaveUserReference(user)) {
    const activeSubscription = getLatestActiveSubscription(user.subscriptions)
    const newExpire = computeNewExpireAt(activeSubscription, input.plan, input.periodMode)
    try {
      const updated = await remnawave.updateUser(remnawaveUserReference(user), {
        expireAt: newExpire.toISOString(),
        status: 'ACTIVE',
        // При продлении лимит обычно не меняется — но если у нового тарифа другой
        // (например, с безлимита переходим на 200 ГБ), обновим:
        trafficLimitBytes:
          input.plan.trafficLimitGb == null ? 0 : Number(gbToBytes(input.plan.trafficLimitGb)),
        hwidDeviceLimit: input.plan.unlimitedDevices ? 0 : input.plan.deviceLimit,
        telegramId: toRemnawaveTelegramId(user.telegramId),
        tag: 'IMPORTED',
        activeInternalSquads,
      })
      remnawaveUser = updated.response
      if (input.periodMode === 'REPLACE') {
        const reset = await remnawave.resetTraffic(remnawaveUser)
        remnawaveUser = reset.response
      }
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
          remnawaveId: remnawaveUser.id,
          remnawaveUuid: remnawaveUser.uuid ?? null,
          remnawaveShortUuid: remnawaveUser.shortUuid,
          remnawaveUsername: remnawaveUser.username,
        },
      })
    }
  } else {
    // Создаём
    isNew = true
    const expireAt = computeNewExpireAt(undefined, input.plan, input.periodMode)
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
        remnawaveId: remnawaveUser.id,
        remnawaveUuid: remnawaveUser.uuid ?? null,
        remnawaveShortUuid: remnawaveUser.shortUuid,
        remnawaveUsername: remnawaveUser.username,
      },
    })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      remnawaveId: remnawaveUser.id,
      remnawaveUuid: remnawaveUser.uuid ?? null,
      remnawaveShortUuid: remnawaveUser.shortUuid,
      remnawaveUsername: remnawaveUser.username,
    },
  })

  // Денормализуем в нашу БД
  const trafficLimit = readRemnawaveBigInt(remnawaveUser, ['trafficLimitBytes', 'trafficLimit'])
  const trafficUsed = readRemnawaveBigInt(remnawaveUser, ['usedTrafficBytes', 'trafficUsedBytes'])
  const lifetimeUsed = readRemnawaveBigInt(remnawaveUser, [
    'lifetimeUsedTrafficBytes',
    'lifetimeTrafficUsedBytes',
  ])
  const subscription = await prisma.$transaction(async (tx) => {
    const row = latestSubscription
      ? await tx.subscription.update({
          where: { id: latestSubscription.id },
          data: {
            planId: input.plan.id,
            planManagedByCabinet: true,
            startAt: isPlanSwitch ? new Date() : undefined,
            expireAt: new Date(remnawaveUser.expireAt),
            status: mapStatus(remnawaveUser.status),
            trafficLimitBytes: trafficLimit === 0n ? null : trafficLimit,
            trafficUsedBytes: trafficUsed,
            lifetimeUsedBytes: lifetimeUsed,
            deviceLimit: input.plan.unlimitedDevices ? null : input.plan.deviceLimit,
            lastSyncedAt: new Date(),
            pendingSync: false,
            whitelistAddonActive,
            whitelistAddonActivatedAt,
            whitelistAddonExpireAt,
            whitelistAddonPausedAt: null,
            whitelistAddonRemainingSeconds: null,
            whitelistAddonPaymentId,
            whitelistAddonInternalSquads: whitelistAddonSquads,
            graceStartedAt: null,
            graceExpireAt: null,
          },
        })
      : await tx.subscription.create({
          data: {
            userId: user.id,
            planId: input.plan.id,
            planManagedByCabinet: true,
            startAt: new Date(),
            expireAt: new Date(remnawaveUser.expireAt),
            status: mapStatus(remnawaveUser.status),
            trafficLimitBytes: trafficLimit === 0n ? null : trafficLimit,
            trafficUsedBytes: trafficUsed,
            lifetimeUsedBytes: lifetimeUsed,
            deviceLimit: input.plan.unlimitedDevices ? null : input.plan.deviceLimit,
            lastSyncedAt: new Date(),
            pendingSync: false,
            whitelistAddonActive,
            whitelistAddonActivatedAt,
            whitelistAddonExpireAt,
            whitelistAddonPausedAt: null,
            whitelistAddonRemainingSeconds: null,
            whitelistAddonPaymentId,
            whitelistAddonInternalSquads: whitelistAddonSquads,
            graceStartedAt: null,
            graceExpireAt: null,
          },
        })

    if (whitelistAddonSource && whitelistAddonSource.id !== row.id) {
      await tx.subscription.update({
        where: { id: whitelistAddonSource.id },
        data: {
          whitelistAddonActive: false,
          whitelistAddonActivatedAt: null,
          whitelistAddonExpireAt: null,
          whitelistAddonPausedAt: null,
          whitelistAddonRemainingSeconds: null,
          whitelistAddonPaymentId: null,
          whitelistAddonInternalSquads: [],
        },
      })
    }

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
  plan: EnsureSubscriptionInput['plan'],
  periodMode: EnsureSubscriptionInput['periodMode'] = 'AUTO'
) {
  if (plan.unlimitedDuration) return unlimitedExpireAt()
  if (periodMode === 'REPLACE') {
    return new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000)
  }
  if (periodMode === 'EXTEND') {
    const base = active && active.expireAt.getTime() > Date.now() ? active.expireAt : new Date()
    return new Date(base.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)
  }
  const isSamePlan = active?.planId === plan.id
  const base = isSamePlan && active.expireAt.getTime() > Date.now() ? active.expireAt : new Date()
  return new Date(base.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)
}

function unlimitedExpireAt() {
  return new Date('2099-12-31T23:59:59.000Z')
}

function getLatestActiveSubscription<Subscription extends {
  expireAt: Date
  status: string
  planId?: string | null
}>(subscriptions: Subscription[]) {
  return subscriptions
    .filter((s) => s.status === 'ACTIVE' || s.status === 'LIMITED')
    .sort((a, b) => b.expireAt.getTime() - a.expireAt.getTime())[0]
}

type WhitelistAddonSource = {
  whitelistAddonActive: boolean
  whitelistAddonActivatedAt: Date | null
  whitelistAddonExpireAt: Date | null
  whitelistAddonPausedAt: Date | null
  whitelistAddonRemainingSeconds: bigint | null
  whitelistAddonPaymentId: string | null
  whitelistAddonInternalSquads: string[]
  status: string
  expireAt: Date
  graceExpireAt: Date | null
  updatedAt: Date
  plan?: { whitelistAddonInternalSquads: string[] } | null
}

function resolveWhitelistAddonForActivation(input: {
  source?: WhitelistAddonSource
  requested?: EnsureSubscriptionInput['whitelistAddon']
  paymentId?: string
  now: Date
}) {
  const source = input.source
  const sourceIsActive = Boolean(source && isWhitelistAddonCurrentlyActive(source, input.now))
  const storedRemaining = source?.whitelistAddonRemainingSeconds ?? 0n
  const derivedPauseAt = source
    ? getWhitelistAddonPauseAt(source, input.now)
    : input.now
  const remainingSeconds = storedRemaining > 0n
    ? storedRemaining
    : source && !sourceIsActive
      ? getWhitelistAddonRemainingSeconds(source.whitelistAddonExpireAt, derivedPauseAt)
      : 0n
  const resumedExpireAt = remainingSeconds > 0n
    ? getResumedWhitelistAddonExpireAt(input.now, remainingSeconds)
    : null
  const existingExpireAt = sourceIsActive ? source?.whitelistAddonExpireAt ?? null : resumedExpireAt
  const requestedAt = input.requested?.activatedAt ?? input.now
  const requestedBase = existingExpireAt && existingExpireAt > requestedAt ? existingExpireAt : requestedAt
  const expireAt = input.requested
    ? getWhitelistAddonExpireAt(requestedBase)
    : existingExpireAt
  const active = Boolean(expireAt && expireAt > input.now)
  const squads = input.requested
    ? input.requested.internalSquads
    : source?.whitelistAddonInternalSquads.length
      ? source.whitelistAddonInternalSquads
      : source?.plan?.whitelistAddonInternalSquads ?? []

  return {
    active,
    activatedAt: active
      ? source?.whitelistAddonActivatedAt ?? requestedAt
      : null,
    expireAt: active ? expireAt : null,
    paymentId: active
      ? input.requested
        ? input.paymentId ?? null
        : source?.whitelistAddonPaymentId ?? null
      : null,
    squads: active ? squads : [],
  }
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
  const base = (email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_-]/g, '_')
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
    hwidDeviceLimit: input.plan.unlimitedDevices ? 0 : input.plan.deviceLimit,
    activeInternalSquads: input.activeInternalSquads,
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

export function resolvePlanActiveInternalSquads(planSquads: string[] | undefined) {
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
