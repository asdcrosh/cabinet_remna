import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { hasRemnawaveUserReference, remnawave, remnawaveUserReference } from './remnawave'
import { resolvePlanActiveInternalSquads } from './subscription'

export const WHITELIST_ADDON_NAME = 'Доступ к серверам с белыми списками'

export type WhitelistAddonSnapshot = {
  type: 'WHITELIST_ADDON'
  name: string
  planId: string
  subscriptionId: string
  subscriptionExpireAt: string
  priceKopecks: number
  internalSquads: string[]
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
  const activatedAt = new Date()
  const savedSubscription = await prisma.$transaction(async (tx) => {
    const row = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        whitelistAddonActive: true,
        whitelistAddonActivatedAt: activatedAt,
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
      whitelistAddonPaymentId: null,
      lastSyncedAt: new Date(),
    },
  })
  return { revoked: true as const }
}

function uniqueSquads(squads: string[]) {
  return Array.from(new Set(squads.map((squad) => squad.trim()).filter(Boolean)))
}
