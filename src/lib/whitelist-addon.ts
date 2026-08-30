import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { hasRemnawaveUserReference, remnawave, remnawaveUserReference } from './remnawave'
import { resolvePlanActiveInternalSquads } from './subscription'
import { logError } from './logger'
import {
  getResumedWhitelistAddonExpireAt,
  getWhitelistAddonExpireAt,
  getWhitelistAddonPauseAt,
  getWhitelistAddonRemainingSeconds,
} from './whitelist-addon-policy'

export const WHITELIST_ADDON_NAME = 'Доступ к серверам с белыми списками'
export const WHITELIST_ADDON_RECEIPT_NAME = 'Расширенный доступ'
export { WHITELIST_ADDON_DURATION_DAYS } from './whitelist-addon-policy'

export class WhitelistAddonManagementError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WhitelistAddonManagementError'
  }
}

export type WhitelistAddonSnapshot = {
  type: 'WHITELIST_ADDON'
  name: string
  planId: string
  subscriptionId: string
  subscriptionExpireAt: string
  priceKopecks: number
  internalSquads: string[]
}

export type BundledWhitelistAddonSnapshot = {
  type: 'WHITELIST_ADDON_BUNDLE'
  name: string
  planId: string
  priceKopecks: number
  internalSquads: string[]
}

export function buildBundledWhitelistAddonSnapshot(input: {
  planId: string
  priceKopecks: number
  internalSquads: string[]
}): BundledWhitelistAddonSnapshot {
  return {
    type: 'WHITELIST_ADDON_BUNDLE',
    name: WHITELIST_ADDON_NAME,
    planId: input.planId,
    priceKopecks: input.priceKopecks,
    internalSquads: uniqueSquads(input.internalSquads),
  }
}

export function readBundledWhitelistAddonSnapshot(
  value: Prisma.JsonValue | null | undefined
): BundledWhitelistAddonSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (
    value.type !== 'WHITELIST_ADDON_BUNDLE'
    || typeof value.name !== 'string'
    || typeof value.planId !== 'string'
    || typeof value.priceKopecks !== 'number'
    || !Array.isArray(value.internalSquads)
    || !value.internalSquads.every((item) => typeof item === 'string')
  ) {
    return null
  }
  return value as BundledWhitelistAddonSnapshot
}

export function buildWhitelistAddonSnapshot(input: {
  planId: string
  subscriptionId: string
  subscriptionExpireAt: Date
  priceKopecks: number
  internalSquads: string[]
}): WhitelistAddonSnapshot {
  return {
    type: 'WHITELIST_ADDON',
    name: WHITELIST_ADDON_NAME,
    planId: input.planId,
    subscriptionId: input.subscriptionId,
    subscriptionExpireAt: input.subscriptionExpireAt.toISOString(),
    priceKopecks: input.priceKopecks,
    internalSquads: uniqueSquads(input.internalSquads),
  }
}

export function readWhitelistAddonSnapshot(value: Prisma.JsonValue | null | undefined): WhitelistAddonSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (
    value.type !== 'WHITELIST_ADDON'
    || typeof value.name !== 'string'
    || typeof value.planId !== 'string'
    || typeof value.subscriptionId !== 'string'
    || typeof value.subscriptionExpireAt !== 'string'
    || typeof value.priceKopecks !== 'number'
    || !Array.isArray(value.internalSquads)
    || !value.internalSquads.every((item) => typeof item === 'string')
  ) {
    return null
  }
  return value as WhitelistAddonSnapshot
}

export async function provisionWhitelistAddon(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: true, plan: true, subscription: true },
  })
  if (!payment || payment.purchaseType !== 'WHITELIST_ADDON') {
    throw new Error('Платёж дополнения не найден')
  }
  if (payment.subscriptionProvisionedAt && payment.subscription) {
    return { subscription: payment.subscription, remnawaveUser: null, isNew: false, idempotent: true }
  }

  const snapshot = readWhitelistAddonSnapshot(payment.addonSnapshot)
  const subscription = payment.subscription
  if (!snapshot || !subscription || snapshot.subscriptionId !== subscription.id) {
    throw new Error('Данные дополнения повреждены')
  }
  if (subscription.userId !== payment.userId || subscription.planId !== payment.planId) {
    throw new Error('Текущая подписка не соответствует дополнению')
  }
  if (!['ACTIVE', 'LIMITED'].includes(subscription.status) || subscription.expireAt.getTime() <= Date.now()) {
    throw new Error('Подписка завершилась до выдачи дополнения')
  }
  if (!hasRemnawaveUserReference(payment.user)) {
    throw new Error('Профиль Remnawave не найден')
  }

  const pausedSource = subscription.whitelistAddonRemainingSeconds
    && subscription.whitelistAddonRemainingSeconds > 0n
    ? subscription
    : await prisma.subscription.findFirst({
        where: {
          userId: payment.userId,
          id: { not: subscription.id },
          whitelistAddonRemainingSeconds: { gt: 0n },
        },
        orderBy: { updatedAt: 'desc' },
      })

  const activeInternalSquads = uniqueSquads([
    ...resolvePlanActiveInternalSquads(payment.plan.activeInternalSquads),
    ...snapshot.internalSquads,
  ])
  const updated = await remnawave.updateUser(remnawaveUserReference(payment.user), {
    activeInternalSquads,
  })
  const activatedAt = payment.paidAt ?? new Date()
  const resumedExpireAt = pausedSource?.whitelistAddonRemainingSeconds
    && pausedSource.whitelistAddonRemainingSeconds > 0n
    ? getResumedWhitelistAddonExpireAt(activatedAt, pausedSource.whitelistAddonRemainingSeconds)
    : null
  const activeExpireAt = subscription.whitelistAddonActive
    && subscription.whitelistAddonExpireAt
    && subscription.whitelistAddonExpireAt.getTime() > activatedAt.getTime()
    ? subscription.whitelistAddonExpireAt
    : null
  const expiryBase = [activatedAt, activeExpireAt, resumedExpireAt]
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? activatedAt
  const expireAt = getWhitelistAddonExpireAt(expiryBase)
  const savedSubscription = await prisma.$transaction(async (tx) => {
    const row = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        whitelistAddonActive: true,
        whitelistAddonActivatedAt: activatedAt,
        whitelistAddonExpireAt: expireAt,
        whitelistAddonPausedAt: null,
        whitelistAddonRemainingSeconds: null,
        whitelistAddonPaymentId: payment.id,
        whitelistAddonInternalSquads: snapshot.internalSquads,
        lastSyncedAt: activatedAt,
      },
    })
    if (pausedSource && pausedSource.id !== subscription.id) {
      await tx.subscription.update({
        where: { id: pausedSource.id },
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
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        subscriptionProvisionedAt: activatedAt,
        provisioningError: null,
      },
    })
    return row
  })

  return {
    subscription: savedSubscription,
    remnawaveUser: updated.response,
    isNew: false,
    idempotent: false,
  }
}

export async function revokeWhitelistAddonForPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: true, plan: true, subscription: { include: { plan: true } } },
  })
  const linkedSubscription = payment?.subscription
  const linkedSubscriptionOwnsAddon = Boolean(
    linkedSubscription
    && linkedSubscription.whitelistAddonPaymentId === payment?.id
    && (linkedSubscription.whitelistAddonActive || (
      linkedSubscription.whitelistAddonRemainingSeconds
      && linkedSubscription.whitelistAddonRemainingSeconds > 0n
    ))
  )
  const subscription = linkedSubscriptionOwnsAddon
    ? linkedSubscription
    : payment
      ? await prisma.subscription.findFirst({
          where: {
            userId: payment.userId,
            whitelistAddonPaymentId: payment.id,
            OR: [
              { whitelistAddonActive: true },
              { whitelistAddonRemainingSeconds: { gt: 0n } },
            ],
          },
          orderBy: { updatedAt: 'desc' },
          include: { plan: true },
        })
      : null
  if (
    !payment
    || payment.purchaseType !== 'WHITELIST_ADDON'
    || !subscription
    || (!subscription.whitelistAddonActive && !(
      subscription.whitelistAddonRemainingSeconds
      && subscription.whitelistAddonRemainingSeconds > 0n
    ))
    || subscription.whitelistAddonPaymentId !== payment.id
  ) {
    return { revoked: false as const }
  }
  if (!hasRemnawaveUserReference(payment.user)) {
    throw new Error('Профиль Remnawave не найден для отзыва дополнения')
  }

  await remnawave.updateUser(remnawaveUserReference(payment.user), {
    activeInternalSquads: resolvePlanActiveInternalSquads(
      subscription.plan?.activeInternalSquads ?? payment.plan.activeInternalSquads
    ),
  })
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      whitelistAddonActive: false,
      whitelistAddonActivatedAt: null,
      whitelistAddonExpireAt: null,
      whitelistAddonPausedAt: null,
      whitelistAddonRemainingSeconds: null,
      whitelistAddonPaymentId: null,
      whitelistAddonInternalSquads: [],
      lastSyncedAt: new Date(),
    },
  })
  return { revoked: true as const }
}

export async function grantWhitelistAddonManually(input: {
  userId: string
  expireAt: Date
}) {
  const now = new Date()
  if (!Number.isFinite(input.expireAt.getTime()) || input.expireAt.getTime() <= now.getTime()) {
    throw new WhitelistAddonManagementError('Дата окончания БС должна быть в будущем')
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      userId: input.userId,
      status: { in: ['ACTIVE', 'LIMITED'] },
      expireAt: { gt: now },
    },
    orderBy: { expireAt: 'desc' },
    include: { user: true, plan: true },
  })
  if (!subscription) throw new WhitelistAddonManagementError('У пользователя нет действующей подписки')
  if (!subscription.plan) throw new WhitelistAddonManagementError('У подписки не найден тариф')
  if (subscription.plan.whitelistAddonInternalSquads.length === 0) {
    throw new WhitelistAddonManagementError('В текущем тарифе не настроены серверные группы БС')
  }
  if (!hasRemnawaveUserReference(subscription.user)) {
    throw new WhitelistAddonManagementError('Профиль Remnawave не найден')
  }

  const activeInternalSquads = uniqueSquads([
    ...resolvePlanActiveInternalSquads(subscription.plan.activeInternalSquads),
    ...subscription.plan.whitelistAddonInternalSquads,
  ])
  const updated = await remnawave.updateUser(remnawaveUserReference(subscription.user), {
    activeInternalSquads,
  })
  const savedSubscription = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      whitelistAddonActive: true,
      whitelistAddonActivatedAt: now,
      whitelistAddonExpireAt: input.expireAt,
      whitelistAddonPausedAt: null,
      whitelistAddonRemainingSeconds: null,
      whitelistAddonPaymentId: null,
      whitelistAddonInternalSquads: subscription.plan.whitelistAddonInternalSquads,
      lastSyncedAt: now,
    },
  })

  return { subscription: savedSubscription, remnawaveUser: updated.response }
}

export async function revokeWhitelistAddonManually(userId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      OR: [
        { whitelistAddonActive: true },
        { whitelistAddonRemainingSeconds: { gt: 0n } },
      ],
    },
    orderBy: { expireAt: 'desc' },
    include: { user: true, plan: true },
  })
  if (!subscription) return { revoked: false as const }
  if (!subscription.plan) throw new WhitelistAddonManagementError('У подписки не найден тариф')
  if (!hasRemnawaveUserReference(subscription.user)) {
    throw new WhitelistAddonManagementError('Профиль Remnawave не найден')
  }

  await remnawave.updateUser(remnawaveUserReference(subscription.user), {
    activeInternalSquads: resolvePlanActiveInternalSquads(subscription.plan.activeInternalSquads),
  })
  const savedSubscription = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      whitelistAddonActive: false,
      whitelistAddonActivatedAt: null,
      whitelistAddonExpireAt: null,
      whitelistAddonPausedAt: null,
      whitelistAddonRemainingSeconds: null,
      whitelistAddonPaymentId: null,
      whitelistAddonInternalSquads: [],
      lastSyncedAt: new Date(),
    },
  })
  return { revoked: true as const, subscription: savedSubscription }
}

export async function reconcileExpiredWhitelistAddons(options?: {
  limit?: number
  shouldStop?: () => boolean
}) {
  const now = new Date()
  const subscriptions = await prisma.subscription.findMany({
    where: {
      whitelistAddonActive: true,
      whitelistAddonExpireAt: { lte: now },
      status: { in: ['ACTIVE', 'LIMITED'] },
      expireAt: { gt: now },
    },
    orderBy: { whitelistAddonExpireAt: 'asc' },
    take: options?.limit ?? 100,
    include: { user: true, plan: true },
  })
  let revoked = 0
  let failed = 0

  for (const subscription of subscriptions) {
    if (options?.shouldStop?.()) break
    try {
      if (hasRemnawaveUserReference(subscription.user)) {
        if (!subscription.plan) throw new Error('Тариф дополнения не найден')
        await remnawave.updateUser(remnawaveUserReference(subscription.user), {
          activeInternalSquads: resolvePlanActiveInternalSquads(subscription.plan.activeInternalSquads),
        })
      }
      const result = await prisma.subscription.updateMany({
        where: {
          id: subscription.id,
          whitelistAddonActive: true,
          whitelistAddonExpireAt: { lte: now },
        },
        data: {
          whitelistAddonActive: false,
          whitelistAddonPausedAt: null,
          whitelistAddonRemainingSeconds: null,
          whitelistAddonInternalSquads: [],
          lastSyncedAt: new Date(),
        },
      })
      revoked += result.count
      if (result.count > 0) {
        await prisma.auditLog.create({
          data: {
            targetId: subscription.userId,
            action: 'ADMIN_FEATURES_UPDATED',
            message: 'Доступ к БС отключён по окончании срока',
            metadata: { subscriptionId: subscription.id },
          },
        })
      }
    } catch (error) {
      failed += 1
      logError('whitelist_addon.expiry_revoke_failed', error, {
        subscriptionId: subscription.id,
        userId: subscription.userId,
      })
    }
  }

  return { checked: subscriptions.length, revoked, failed }
}

export async function reconcileUnavailableSubscriptionWhitelistAddons(options?: {
  limit?: number
  shouldStop?: () => boolean
}) {
  const now = new Date()
  const subscriptions = await prisma.subscription.findMany({
    where: {
      whitelistAddonActive: true,
      whitelistAddonExpireAt: { not: null },
      OR: [
        { status: { notIn: ['ACTIVE', 'LIMITED'] } },
        {
          AND: [
            { expireAt: { lte: now } },
            { OR: [{ graceExpireAt: null }, { graceExpireAt: { lte: now } }] },
          ],
        },
      ],
    },
    orderBy: { expireAt: 'asc' },
    take: options?.limit ?? 100,
  })
  let paused = 0
  let exhausted = 0
  let failed = 0

  for (const subscription of subscriptions) {
    if (options?.shouldStop?.()) break
    try {
      const pausedAt = getWhitelistAddonPauseAt(subscription, now)
      const remainingSeconds = getWhitelistAddonRemainingSeconds(
        subscription.whitelistAddonExpireAt,
        pausedAt
      )
      const result = await prisma.subscription.updateMany({
        where: {
          id: subscription.id,
          whitelistAddonActive: true,
          whitelistAddonExpireAt: subscription.whitelistAddonExpireAt,
        },
        data: remainingSeconds > 0n
          ? {
              whitelistAddonActive: false,
              whitelistAddonExpireAt: null,
              whitelistAddonPausedAt: pausedAt,
              whitelistAddonRemainingSeconds: remainingSeconds,
            }
          : {
              whitelistAddonActive: false,
              whitelistAddonPausedAt: null,
              whitelistAddonRemainingSeconds: null,
              whitelistAddonInternalSquads: [],
            },
      })
      if (remainingSeconds > 0n) paused += result.count
      else exhausted += result.count
    } catch (error) {
      failed += 1
      logError('whitelist_addon.pause_failed', error, {
        subscriptionId: subscription.id,
        userId: subscription.userId,
      })
    }
  }

  return { checked: subscriptions.length, paused, exhausted, failed }
}

export async function reconcileAvailableSubscriptionWhitelistAddons(options?: {
  limit?: number
  shouldStop?: () => boolean
}) {
  const now = new Date()
  const subscriptions = await prisma.subscription.findMany({
    where: {
      whitelistAddonActive: false,
      whitelistAddonRemainingSeconds: { gt: 0n },
      status: { in: ['ACTIVE', 'LIMITED'] },
      OR: [
        { expireAt: { gt: now } },
        { graceExpireAt: { gt: now } },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: options?.limit ?? 100,
    include: { user: true, plan: true },
  })
  let resumed = 0
  let failed = 0

  for (const subscription of subscriptions) {
    if (options?.shouldStop?.()) break
    try {
      const remainingSeconds = subscription.whitelistAddonRemainingSeconds
      if (!remainingSeconds || remainingSeconds <= 0n) continue
      if (!hasRemnawaveUserReference(subscription.user)) {
        throw new Error('Профиль Remnawave не найден')
      }
      if (!subscription.plan) throw new Error('Тариф дополнения не найден')
      const addonSquads = subscription.whitelistAddonInternalSquads.length
        ? subscription.whitelistAddonInternalSquads
        : subscription.plan.whitelistAddonInternalSquads
      if (addonSquads.length === 0) throw new Error('Группы дополнения не найдены')

      await remnawave.updateUser(remnawaveUserReference(subscription.user), {
        activeInternalSquads: uniqueSquads([
          ...resolvePlanActiveInternalSquads(subscription.plan.activeInternalSquads),
          ...addonSquads,
        ]),
      })
      const expireAt = getResumedWhitelistAddonExpireAt(now, remainingSeconds)
      const result = await prisma.subscription.updateMany({
        where: {
          id: subscription.id,
          whitelistAddonActive: false,
          whitelistAddonRemainingSeconds: remainingSeconds,
        },
        data: {
          whitelistAddonActive: true,
          whitelistAddonExpireAt: expireAt,
          whitelistAddonPausedAt: null,
          whitelistAddonRemainingSeconds: null,
          whitelistAddonInternalSquads: addonSquads,
          lastSyncedAt: now,
        },
      })
      resumed += result.count
    } catch (error) {
      failed += 1
      logError('whitelist_addon.resume_failed', error, {
        subscriptionId: subscription.id,
        userId: subscription.userId,
      })
    }
  }

  return { checked: subscriptions.length, resumed, failed }
}

function uniqueSquads(squads: string[]) {
  return Array.from(new Set(squads.map((squad) => squad.trim()).filter(Boolean)))
}
