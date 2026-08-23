import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { hasRemnawaveUserReference, remnawave, remnawaveUserReference } from './remnawave'
import { resolvePlanActiveInternalSquads } from './subscription'
import { logError } from './logger'
import { getWhitelistAddonExpireAt } from './whitelist-addon-policy'

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

  const activeInternalSquads = uniqueSquads([
    ...resolvePlanActiveInternalSquads(payment.plan.activeInternalSquads),
    ...snapshot.internalSquads,
  ])
  const updated = await remnawave.updateUser(remnawaveUserReference(payment.user), {
    activeInternalSquads,
  })
  const activatedAt = payment.paidAt ?? new Date()
  const expireAt = getWhitelistAddonExpireAt(activatedAt)
  const savedSubscription = await prisma.$transaction(async (tx) => {
    const row = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        whitelistAddonActive: true,
        whitelistAddonActivatedAt: activatedAt,
        whitelistAddonExpireAt: expireAt,
        whitelistAddonPaymentId: payment.id,
        lastSyncedAt: activatedAt,
      },
    })
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
    include: { user: true, plan: true, subscription: true },
  })
  const subscription = payment?.subscription
  if (
    !payment
    || payment.purchaseType !== 'WHITELIST_ADDON'
    || !subscription?.whitelistAddonActive
    || subscription.whitelistAddonPaymentId !== payment.id
  ) {
    return { revoked: false as const }
  }
  if (!hasRemnawaveUserReference(payment.user)) {
    throw new Error('Профиль Remnawave не найден для отзыва дополнения')
  }

  await remnawave.updateUser(remnawaveUserReference(payment.user), {
    activeInternalSquads: resolvePlanActiveInternalSquads(payment.plan.activeInternalSquads),
  })
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      whitelistAddonActive: false,
      whitelistAddonActivatedAt: null,
      whitelistAddonExpireAt: null,
      whitelistAddonPaymentId: null,
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
      whitelistAddonPaymentId: null,
      lastSyncedAt: now,
    },
  })

  return { subscription: savedSubscription, remnawaveUser: updated.response }
}

export async function revokeWhitelistAddonManually(userId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { userId, whitelistAddonActive: true },
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
      whitelistAddonPaymentId: null,
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
          lastSyncedAt: new Date(),
        },
      })
      revoked += result.count
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

function uniqueSquads(squads: string[]) {
  return Array.from(new Set(squads.map((squad) => squad.trim()).filter(Boolean)))
}
