import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { hasRemnawaveUserReference, remnawave, remnawaveUserReference } from './remnawave'

export const DEVICE_LIMIT_ADDON_RECEIPT_NAME = 'Дополнительные устройства'

export type DeviceLimitAddonSnapshot = {
  type: 'DEVICE_LIMIT_ADDON'
  subscriptionId: string
  fromLimit: number
  toLimit: number
  additionalDevices: number
  remainingDays: number
  priceKopecks: number
}

export function calculateDeviceLimitAddon(input: {
  currentLimit: number
  targetLimit: number
  maxLimit: number
  extraDevicePriceKopecks: number
  durationDays: number
  expireAt: Date
  now?: Date
}) {
  const now = input.now ?? new Date()
  if (!Number.isInteger(input.targetLimit) || input.targetLimit <= input.currentLimit) {
    throw new Error('Выберите лимит больше текущего')
  }
  if (input.targetLimit > input.maxLimit) throw new Error(`Максимум устройств: ${input.maxLimit}`)
  if (input.expireAt.getTime() <= now.getTime()) throw new Error('Подписка уже завершилась')
  if (input.extraDevicePriceKopecks <= 0) throw new Error('Дополнительные устройства для тарифа не настроены')

  const dayMs = 24 * 60 * 60 * 1000
  const remainingDays = Math.max(1, Math.ceil((input.expireAt.getTime() - now.getTime()) / dayMs))
  const additionalDevices = input.targetLimit - input.currentLimit
  const rawAmount = additionalDevices
    * input.extraDevicePriceKopecks
    * Math.min(remainingDays, input.durationDays)
    / Math.max(1, input.durationDays)
  const priceKopecks = Math.max(100, Math.ceil(rawAmount / 100) * 100)

  return { additionalDevices, remainingDays, priceKopecks }
}

export function readDeviceLimitAddonSnapshot(value: Prisma.JsonValue | null | undefined): DeviceLimitAddonSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (
    value.type !== 'DEVICE_LIMIT_ADDON'
    || typeof value.subscriptionId !== 'string'
    || typeof value.fromLimit !== 'number'
    || typeof value.toLimit !== 'number'
    || typeof value.additionalDevices !== 'number'
    || typeof value.remainingDays !== 'number'
    || typeof value.priceKopecks !== 'number'
  ) return null
  return value as DeviceLimitAddonSnapshot
}

export async function provisionDeviceLimitAddon(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: true, subscription: true },
  })
  if (!payment || payment.purchaseType !== 'DEVICE_LIMIT_ADDON') throw new Error('Платёж устройств не найден')
  const snapshot = readDeviceLimitAddonSnapshot(payment.addonSnapshot)
  const subscription = payment.subscription
  if (!snapshot || !subscription || snapshot.subscriptionId !== subscription.id) throw new Error('Данные дополнения повреждены')
  if (subscription.userId !== payment.userId || !['ACTIVE', 'LIMITED'].includes(subscription.status)) {
    throw new Error('Действующая подписка не найдена')
  }
  if (subscription.expireAt.getTime() <= Date.now()) throw new Error('Подписка завершилась до выдачи устройств')
  if (!hasRemnawaveUserReference(payment.user)) throw new Error('Профиль Remnawave не найден')

  const currentLimit = subscription.deviceLimit ?? snapshot.fromLimit
  const targetLimit = Math.max(currentLimit, snapshot.toLimit)
  if (payment.subscriptionProvisionedAt && currentLimit >= snapshot.toLimit) {
    return { subscription, remnawaveUser: null, isNew: false, idempotent: true }
  }

  const updated = await remnawave.updateUser(remnawaveUserReference(payment.user), {
    hwidDeviceLimit: targetLimit,
  })
  const provisionedAt = payment.paidAt ?? new Date()
  const savedSubscription = await prisma.$transaction(async (tx) => {
    const row = await tx.subscription.update({
      where: { id: subscription.id },
      data: { deviceLimit: targetLimit, lastSyncedAt: provisionedAt },
    })
    await tx.payment.update({
      where: { id: payment.id },
      data: { subscriptionProvisionedAt: provisionedAt, provisioningError: null },
    })
    return row
  })
  return { subscription: savedSubscription, remnawaveUser: updated.response, isNew: false, idempotent: false }
}
