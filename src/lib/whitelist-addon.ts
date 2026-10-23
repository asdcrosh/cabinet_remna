import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { hasRemnawaveUserReference, remnawave, remnawaveUserReference } from './remnawave'
import { resolvePlanActiveInternalSquads } from './subscription'
import { logError } from './logger'
import { updateWhitelistSquads } from './whitelist-addon-squads'
import { withDistributedLock } from './distributed-lock'
import { whitelistRewardTimeLeft } from './whitelist-addon-rewards'
import {
  getResumedWhitelistAddonExpireAt,
  getWhitelistAddonExpireAt,
  getWhitelistAddonPauseAt,
  getWhitelistAddonRemainingSeconds,
  WHITELIST_ADDON_DURATION_DAYS,
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
  channel?: 'TELEGRAM_BOT'
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
  channel?: 'TELEGRAM_BOT'
  planId: string
  subscriptionId: string
  subscriptionExpireAt: Date
  priceKopecks: number
  internalSquads: string[]
}): WhitelistAddonSnapshot {
  return {
    type: 'WHITELIST_ADDON',
    ...(input.channel ? { channel: input.channel } : {}),
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
    include: { user: true, plan: true, subscription: { include: { plan: true } } },
  })
  if (!payment || payment.purchaseType !== 'WHITELIST_ADDON') {
    throw new Error('Платёж дополнения не найден')
  }
  if (payment.subscriptionProvisionedAt && payment.subscription) {
    return { subscription: payment.subscription, remnawaveUser: null, isNew: false, idempotent: true }
  }

  const snapshot = readWhitelistAddonSnapshot(payment.addonSnapshot)
  let subscription = payment.subscription
  if (!snapshot || !subscription || snapshot.subscriptionId !== subscription.id) {
    throw new Error('Данные дополнения повреждены')
  }
  if (subscription.userId !== payment.userId) {
    throw new Error('Текущая подписка не соответствует дополнению')
  }
  // The main subscription may have been renewed/replaced while the invoice was open.
  subscription = await prisma.subscription.findFirst({
    where: { userId: payment.userId, status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gt: new Date() } },
    include: { plan: true }, orderBy: { expireAt: 'desc' },
  }) ?? subscription
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

  const activatedAt = new Date()
  const rewardSource = pausedSource ?? subscription
  const rewardSeconds = whitelistRewardTimeLeft(rewardSource, activatedAt)
  const rewardSquads = rewardSeconds > 0n ? rewardSource.whitelistAddonRewardSquads ?? [] : []
  const addonSquads = uniqueSquads([...snapshot.internalSquads, ...rewardSquads])
  const remote = (await remnawave.getUser(remnawaveUserReference(payment.user))).response
  const canActivate = ['ACTIVE', 'LIMITED'].includes(remote.status)
    && new Date(remote.expireAt) > activatedAt
  if (!canActivate) {
    // Successful payment is fulfilled as saved time, never left in an endless retry loop.
    const previousRemaining = pausedSource?.whitelistAddonRemainingSeconds
      ?? (subscription.whitelistAddonActive
        ? getWhitelistAddonRemainingSeconds(subscription.whitelistAddonExpireAt, getWhitelistAddonPauseAt(subscription, activatedAt))
        : 0n)
    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          whitelistAddonActive: false,
          whitelistAddonActivatedAt: activatedAt,
          whitelistAddonExpireAt: null,
          whitelistAddonPausedAt: activatedAt,
          whitelistAddonRemainingSeconds: previousRemaining + BigInt(WHITELIST_ADDON_DURATION_DAYS * 86400),
          whitelistAddonInternalSquads: addonSquads,
          whitelistAddonRewardSeconds: rewardSeconds,
          whitelistAddonRewardSquads: rewardSquads,
          whitelistAddonPaymentId: payment.id,
        },
      })
      if (pausedSource && pausedSource.id !== subscription.id) {
        await tx.subscription.update({ where: { id: pausedSource.id }, data: {
          whitelistAddonActive: false, whitelistAddonExpireAt: null,
          whitelistAddonRemainingSeconds: null, whitelistAddonPausedAt: null,
          whitelistAddonRewardSeconds: 0n, whitelistAddonRewardSquads: [],
        } })
      }
      await tx.payment.update({ where: { id: payment.id }, data: {
        subscriptionId: row.id, subscriptionProvisionedAt: activatedAt, provisioningError: null,
      } })
      return row
    })
    return { subscription: saved, remnawaveUser: null, isNew: false, idempotent: false }
  }
  const updated = await updateWhitelistSquads(
    payment.user,
    resolvePlanActiveInternalSquads(subscription.plan?.activeInternalSquads ?? payment.plan.activeInternalSquads),
    addonSquads,
    subscription.whitelistAddonInternalSquads,
  )
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
        whitelistAddonInternalSquads: addonSquads,
        whitelistAddonRewardSeconds: rewardSeconds,
        whitelistAddonRewardSquads: rewardSquads,
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
          whitelistAddonRewardSeconds: 0n,
          whitelistAddonRewardSquads: [],
        },
      })
    }
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        subscriptionId: subscription.id,
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
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { userId: true } })
  if (!payment) return { revoked: false as const }
  return withWhitelistUserLock(payment.userId, () => revokeWhitelistAddonForPaymentLocked(paymentId))
}

async function revokeWhitelistAddonForPaymentLocked(paymentId: string) {
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

  const now = new Date()
  const rewardSeconds = whitelistRewardTimeLeft(subscription, now)
  const rewardSquads = rewardSeconds > 0n ? subscription.whitelistAddonRewardSquads : []
  const active = rewardSeconds > 0n && ['ACTIVE', 'LIMITED'].includes(subscription.status)
    && (subscription.expireAt > now || Boolean(subscription.graceExpireAt && subscription.graceExpireAt > now))
  if (rewardSeconds > 0n) {
    await updateWhitelistSquads(payment.user,
      resolvePlanActiveInternalSquads(subscription.plan?.activeInternalSquads ?? payment.plan.activeInternalSquads),
      active ? rewardSquads : [], subscription.whitelistAddonInternalSquads)
    const saved = await prisma.subscription.update({ where: { id: subscription.id }, data: {
      whitelistAddonActive: active,
      whitelistAddonExpireAt: active ? new Date(now.getTime() + Number(rewardSeconds) * 1000) : null,
      whitelistAddonPausedAt: active ? null : now,
      whitelistAddonRemainingSeconds: active ? null : rewardSeconds,
      whitelistAddonPaymentId: null,
      whitelistAddonInternalSquads: rewardSquads,
      whitelistAddonRewardSeconds: rewardSeconds,
      whitelistAddonRewardSquads: rewardSquads,
      lastSyncedAt: now,
    } })
    return { revoked: true as const, subscription: saved }
  }

  await updateWhitelistSquads(payment.user,
    resolvePlanActiveInternalSquads(subscription.plan?.activeInternalSquads ?? payment.plan.activeInternalSquads),
    [], subscription.whitelistAddonInternalSquads)
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      whitelistAddonActive: false,
      whitelistAddonActivatedAt: null,
      whitelistAddonExpireAt: null,
      whitelistAddonPausedAt: null,
      whitelistAddonRemainingSeconds: null,
      whitelistAddonPaymentId: null,
      whitelistAddonRewardSeconds: 0n,
      whitelistAddonRewardSquads: [],
      lastSyncedAt: new Date(),
    },
  })
  return { revoked: true as const }
}

export async function grantWhitelistAddonManually(input: {
  userId: string
  expireAt: Date
}) {
  return withWhitelistUserLock(input.userId, () => grantWhitelistAddonManuallyLocked(input))
}

async function grantWhitelistAddonManuallyLocked(input: { userId: string; expireAt: Date }) {
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

  const updated = await updateWhitelistSquads(subscription.user,
    resolvePlanActiveInternalSquads(subscription.plan.activeInternalSquads),
    subscription.plan.whitelistAddonInternalSquads)
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
      whitelistAddonRewardSeconds: 0n,
      whitelistAddonRewardSquads: [],
      lastSyncedAt: now,
    },
  })

  return { subscription: savedSubscription, remnawaveUser: updated.response }
}

export async function revokeWhitelistAddonManually(userId: string) {
  return withWhitelistUserLock(userId, () => revokeWhitelistAddonManuallyLocked(userId))
}

async function revokeWhitelistAddonManuallyLocked(userId: string) {
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

  await updateWhitelistSquads(subscription.user,
    resolvePlanActiveInternalSquads(subscription.plan.activeInternalSquads),
    [], subscription.whitelistAddonInternalSquads)
  const savedSubscription = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      whitelistAddonActive: false,
      whitelistAddonActivatedAt: null,
      whitelistAddonExpireAt: null,
      whitelistAddonPausedAt: null,
      whitelistAddonRemainingSeconds: null,
      whitelistAddonPaymentId: null,
      lastSyncedAt: new Date(),
      whitelistAddonRewardSeconds: 0n,
      whitelistAddonRewardSquads: [],
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

  for (const candidate of subscriptions) {
    if (options?.shouldStop?.()) break
    try {
      const locked = await withDistributedLock(`payment-provisioning:${candidate.userId}`, async () => {
        const subscription = await prisma.subscription.findUnique({
          where: { id: candidate.id }, include: { user: true, plan: true },
        })
        if (!subscription || !subscription.whitelistAddonActive
          || !subscription.whitelistAddonExpireAt || subscription.whitelistAddonExpireAt > now
          || !['ACTIVE', 'LIMITED'].includes(subscription.status)
          || (subscription.expireAt <= now && (!subscription.graceExpireAt || subscription.graceExpireAt <= now))) return
        if (hasRemnawaveUserReference(subscription.user)) {
          await updateWhitelistSquads(subscription.user,
            resolvePlanActiveInternalSquads(subscription.plan?.activeInternalSquads ?? []),
            [], subscription.whitelistAddonInternalSquads)
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
            whitelistAddonRewardSeconds: 0n,
            whitelistAddonRewardSquads: [],
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
      })
      if (!locked.acquired) continue
    } catch (error) {
      failed += 1
      logError('whitelist_addon.expiry_revoke_failed', error, {
        subscriptionId: candidate.id,
        userId: candidate.userId,
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

  for (const candidate of subscriptions) {
    if (options?.shouldStop?.()) break
    try {
      const locked = await withDistributedLock(`payment-provisioning:${candidate.userId}`, async () => {
        const subscription = await prisma.subscription.findUnique({
          where: { id: candidate.id }, include: { user: true, plan: true },
        })
        if (!subscription || !subscription.whitelistAddonActive || !subscription.whitelistAddonExpireAt || (['ACTIVE', 'LIMITED'].includes(subscription.status) && (subscription.expireAt > now || (subscription.graceExpireAt && subscription.graceExpireAt > now)))) return
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
                  },
        })
        if (remainingSeconds > 0n) paused += result.count
        else exhausted += result.count
      })
      if (!locked.acquired) continue
    } catch (error) {
      failed += 1
      logError('whitelist_addon.pause_failed', error, {
        subscriptionId: candidate.id,
        userId: candidate.userId,
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

  for (const candidate of subscriptions) {
    if (options?.shouldStop?.()) break
    try {
      const locked = await withDistributedLock(`payment-provisioning:${candidate.userId}`, async () => {
        const subscription = await prisma.subscription.findUnique({
          where: { id: candidate.id }, include: { user: true, plan: true },
        })
        if (!subscription || subscription.whitelistAddonActive || !subscription.whitelistAddonRemainingSeconds || subscription.whitelistAddonRemainingSeconds <= 0n || !['ACTIVE', 'LIMITED'].includes(subscription.status) || (subscription.expireAt <= now && (!subscription.graceExpireAt || subscription.graceExpireAt <= now))) return
        const remainingSeconds = subscription.whitelistAddonRemainingSeconds
        if (!remainingSeconds || remainingSeconds <= 0n) return
        if (!hasRemnawaveUserReference(subscription.user)) {
          throw new Error('Профиль Remnawave не найден')
        }
        const addonSquads = subscription.whitelistAddonInternalSquads.length
          ? subscription.whitelistAddonInternalSquads
          : subscription.plan?.whitelistAddonInternalSquads ?? []
        if (addonSquads.length === 0) throw new Error('Группы дополнения не найдены')

        await updateWhitelistSquads(subscription.user,
          resolvePlanActiveInternalSquads(subscription.plan?.activeInternalSquads ?? []), addonSquads)
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
      })
      if (!locked.acquired) continue
    } catch (error) {
      failed += 1
      logError('whitelist_addon.resume_failed', error, {
        subscriptionId: candidate.id,
        userId: candidate.userId,
      })
    }
  }

  return { checked: subscriptions.length, resumed, failed }
}

function uniqueSquads(squads: string[]) {
  return Array.from(new Set(squads.map((squad) => squad.trim()).filter(Boolean)))
}

async function withWhitelistUserLock<T>(userId: string, task: () => Promise<T>) {
  const locked = await withDistributedLock(`payment-provisioning:${userId}`, task)
  if (!locked.acquired) throw new WhitelistAddonManagementError('Подписка обновляется. Повторите операцию позже.')
  return locked.value
}
