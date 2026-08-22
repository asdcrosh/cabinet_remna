import type { AutoRenewalStatus, Prisma, YookassaPaymentStatus } from '@prisma/client'
import { buildPaymentServiceName } from './payment-service-name'
import { decryptPaymentSecret, encryptPaymentSecret } from './payment-settings-crypto'
import { prisma } from './prisma'
import { createPayment, type YooPayment } from './yookassa'
import { logError, logInfo } from './logger'
import { notifyUser } from './notifications'
import { getAppUrl } from './app-url'
import { AUTO_RENEWAL_CONSENT_VERSION } from './auto-renewal-consent'
import {
  buildPlanPurchaseSnapshot,
  calculatePlanPurchase,
  type DevicePricedPlan,
} from './plan-purchase'
import {
  buildBundledWhitelistAddonSnapshot,
  readBundledWhitelistAddonSnapshot,
} from './whitelist-addon'

const HOUR_MS = 60 * 60 * 1000
const DEFAULT_LEAD_HOURS = 24
const RETRY_DELAYS_HOURS = [6, 24, 48]

type DueAutoRenewal = Prisma.AutoRenewalGetPayload<{
  include: { user: { select: { id: true; email: true } }; plan: true }
}>

export async function getAutoRenewalState(userId: string) {
  const setting = await prisma.autoRenewal.findUnique({
    where: { userId },
    include: {
      plan: {
        select: {
          id: true,
          name: true,
          priceKopecks: true,
          durationDays: true,
          deviceLimit: true,
          maxDeviceLimit: true,
          extraDevicePriceKopecks: true,
          whitelistAddonEnabled: true,
          whitelistAddonPriceKopecks: true,
          whitelistAddonInternalSquads: true,
        },
      },
    },
  })
  if (!setting) return null
  return {
    id: setting.id,
    plan: setting.plan,
    status: setting.status,
    paymentMethodTitle: setting.paymentMethodTitle,
    paymentMethodSavedAt: setting.paymentMethodSavedAt,
    consentAcceptedAt: setting.consentAcceptedAt,
    consentVersion: setting.consentVersion,
    consentPriceKopecks: setting.consentPriceKopecks,
    consentDurationDays: setting.consentDurationDays,
    deviceLimit: setting.deviceLimit,
    whitelistAddonEnabled: setting.whitelistAddonEnabled,
    nextChargeAt: setting.nextChargeAt,
    retryCount: setting.retryCount,
    lastAttemptAt: setting.lastAttemptAt,
    lastSuccessAt: setting.lastSuccessAt,
    lastError: setting.lastError,
  }
}

export async function enableAutoRenewal(input: {
  userId: string
  planId: string
  consentAccepted: true
  consentVersion: string
}) {
  if (!input.consentAccepted || input.consentVersion !== AUTO_RENEWAL_CONSENT_VERSION) {
    throw new Error('Подтвердите согласие на регулярные списания')
  }
  const [plan, subscription] = await Promise.all([
    prisma.plan.findFirst({ where: { id: input.planId, isActive: true } }),
    prisma.subscription.findFirst({
      where: { userId: input.userId, status: { in: ['ACTIVE', 'LIMITED'] } },
      orderBy: { expireAt: 'desc' },
      select: { expireAt: true, planId: true, deviceLimit: true, whitelistAddonActive: true },
    }),
  ])
  if (!plan || plan.isPromo || plan.priceKopecks <= 0) {
    throw new Error('Для автопродления нужен активный платный тариф')
  }
  if (!subscription || subscription.planId !== plan.id) {
    throw new Error('Автопродление можно включить только для текущего тарифа')
  }
  const deviceLimit = subscription.deviceLimit ?? plan.deviceLimit
  const pricing = calculateAutoRenewalPurchase(plan, deviceLimit)
  const whitelistAddonEnabled = Boolean(
    subscription.whitelistAddonActive
    && plan.whitelistAddonEnabled
    && plan.whitelistAddonPriceKopecks > 0
    && plan.whitelistAddonInternalSquads.length > 0
  )
  const consentPriceKopecks = pricing.originalAmountKopecks
    + (whitelistAddonEnabled ? plan.whitelistAddonPriceKopecks : 0)

  const existing = await prisma.autoRenewal.findUnique({ where: { userId: input.userId } })
  const hasMethod = Boolean(existing?.paymentMethodIdEncrypted)
  const consentAcceptedAt = new Date()
  return prisma.autoRenewal.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      planId: plan.id,
      status: 'AWAITING_PAYMENT_METHOD',
      consentAcceptedAt,
      consentVersion: AUTO_RENEWAL_CONSENT_VERSION,
      consentPriceKopecks,
      consentDurationDays: plan.durationDays,
      deviceLimit,
      whitelistAddonEnabled,
      nextChargeAt: null,
    },
    update: {
      planId: plan.id,
      status: hasMethod ? 'ACTIVE' : 'AWAITING_PAYMENT_METHOD',
      consentAcceptedAt,
      consentVersion: AUTO_RENEWAL_CONSENT_VERSION,
      consentPriceKopecks,
      consentDurationDays: plan.durationDays,
      deviceLimit,
      whitelistAddonEnabled,
      nextChargeAt: hasMethod && subscription ? chargeAt(subscription.expireAt) : null,
      retryCount: 0,
      lastFailurePaymentId: null,
      lastError: null,
      disabledAt: null,
    },
    include: { plan: true },
  })
}

export async function disableAutoRenewal(userId: string) {
  const existing = await prisma.autoRenewal.findUnique({ where: { userId } })
  if (!existing) return null
  return prisma.autoRenewal.update({
    where: { id: existing.id },
    data: {
      status: 'DISABLED',
      paymentMethodIdEncrypted: null,
      paymentMethodTitle: null,
      paymentMethodSavedAt: null,
      nextChargeAt: null,
      retryCount: 0,
      lastFailurePaymentId: null,
      lastError: null,
      disabledAt: new Date(),
    },
  })
}

export async function shouldSavePaymentMethod(userId: string, planId: string) {
  const setting = await prisma.autoRenewal.findUnique({
    where: { userId },
    select: {
      planId: true,
      status: true,
      paymentMethodIdEncrypted: true,
      consentAcceptedAt: true,
      consentVersion: true,
    },
  })
  return Boolean(
    setting
    && setting.planId === planId
    && setting.status !== 'DISABLED'
    && Boolean(setting.consentAcceptedAt)
    && setting.consentVersion === AUTO_RENEWAL_CONSENT_VERSION
    && !setting.paymentMethodIdEncrypted
  )
}

export async function shouldSavePaymentMethodBestEffort(userId: string, planId: string) {
  try {
    return await shouldSavePaymentMethod(userId, planId)
  } catch (error) {
    logError('auto_renewal.save_method_check_failed', error, { userId, planId })
    return false
  }
}

export async function captureSavedPaymentMethod(input: {
  localPaymentId: string
  providerPayment: YooPayment
}) {
  const method = input.providerPayment.payment_method
  if (!method?.id || method.saved !== true) return false

  const payment = await prisma.payment.findUnique({
    where: { id: input.localPaymentId },
    select: {
      userId: true,
      planId: true,
      deviceLimit: true,
      autoRenewalConsentAcceptedAt: true,
      autoRenewalConsentVersion: true,
      addonSnapshot: true,
      plan: {
        select: {
          priceKopecks: true,
          durationDays: true,
          deviceLimit: true,
          maxDeviceLimit: true,
          extraDevicePriceKopecks: true,
          whitelistAddonEnabled: true,
          whitelistAddonPriceKopecks: true,
          whitelistAddonInternalSquads: true,
        },
      },
    },
  })
  if (!payment) return false
  const setting = await prisma.autoRenewal.findUnique({ where: { userId: payment.userId } })
  const checkoutConsentCurrent = Boolean(
    payment.autoRenewalConsentAcceptedAt
    && payment.autoRenewalConsentVersion === AUTO_RENEWAL_CONSENT_VERSION
  )
  if (
    !checkoutConsentCurrent
    && (
      !setting
      || setting.status === 'DISABLED'
      || setting.planId !== payment.planId
      || !setting.consentAcceptedAt
      || setting.consentVersion !== AUTO_RENEWAL_CONSENT_VERSION
    )
  ) return false

  const subscription = await prisma.subscription.findFirst({
    where: { userId: payment.userId, status: { in: ['ACTIVE', 'LIMITED'] } },
    orderBy: { expireAt: 'desc' },
    select: { expireAt: true, planId: true, deviceLimit: true },
  })
  const deviceLimit = payment.deviceLimit ?? subscription?.deviceLimit ?? payment.plan.deviceLimit
  const pricing = calculateAutoRenewalPurchase(payment.plan, deviceLimit)
  const bundledWhitelistAddon = readBundledWhitelistAddonSnapshot(payment.addonSnapshot)
  const whitelistAddonEnabled = Boolean(bundledWhitelistAddon)
  const consentPriceKopecks = pricing.originalAmountKopecks
    + (bundledWhitelistAddon?.priceKopecks ?? 0)
  const consentAcceptedAt = checkoutConsentCurrent
    ? payment.autoRenewalConsentAcceptedAt!
    : setting!.consentAcceptedAt!
  const autoRenewal = await prisma.autoRenewal.upsert({
    where: { userId: payment.userId },
    create: {
      userId: payment.userId,
      planId: payment.planId,
      status: 'ACTIVE',
      paymentMethodIdEncrypted: encryptPaymentSecret(method.id),
      paymentMethodTitle: paymentMethodTitle(method),
      paymentMethodSavedAt: new Date(),
      consentAcceptedAt,
      consentVersion: AUTO_RENEWAL_CONSENT_VERSION,
      consentPriceKopecks,
      consentDurationDays: payment.plan.durationDays,
      deviceLimit,
      whitelistAddonEnabled,
      nextChargeAt: subscription?.planId === payment.planId ? chargeAt(subscription.expireAt) : null,
    },
    update: {
      planId: payment.planId,
      status: 'ACTIVE',
      paymentMethodIdEncrypted: encryptPaymentSecret(method.id),
      paymentMethodTitle: paymentMethodTitle(method),
      paymentMethodSavedAt: new Date(),
      ...(checkoutConsentCurrent
        ? {
            consentAcceptedAt,
            consentVersion: AUTO_RENEWAL_CONSENT_VERSION,
            consentPriceKopecks,
            consentDurationDays: payment.plan.durationDays,
            deviceLimit,
            whitelistAddonEnabled,
          }
        : {}),
      nextChargeAt: subscription?.planId === payment.planId ? chargeAt(subscription.expireAt) : null,
      retryCount: 0,
      lastFailurePaymentId: null,
      lastError: null,
      disabledAt: null,
    },
  })
  await prisma.payment.update({
    where: { id: input.localPaymentId },
    data: { autoRenewalId: autoRenewal.id },
  })
  return true
}

export async function captureSavedPaymentMethodBestEffort(input: {
  localPaymentId: string
  providerPayment: YooPayment
}) {
  try {
    return await captureSavedPaymentMethod(input)
  } catch (error) {
    logError('auto_renewal.payment_method_capture_failed', error, { paymentId: input.localPaymentId })
    return false
  }
}

export async function refreshAutoRenewalSchedule(userId: string, paymentId?: string) {
  const setting = await prisma.autoRenewal.findUnique({ where: { userId } })
  if (
    !setting
    || !setting.paymentMethodIdEncrypted
    || setting.status === 'DISABLED'
    || !setting.consentAcceptedAt
    || setting.consentVersion !== AUTO_RENEWAL_CONSENT_VERSION
  ) return
  const [subscription, payment] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'LIMITED'] } },
      orderBy: { expireAt: 'desc' },
      include: {
        plan: {
          select: {
            id: true,
            isPromo: true,
            priceKopecks: true,
            durationDays: true,
            deviceLimit: true,
            maxDeviceLimit: true,
            extraDevicePriceKopecks: true,
            whitelistAddonEnabled: true,
            whitelistAddonPriceKopecks: true,
            whitelistAddonInternalSquads: true,
          },
        },
      },
    }),
    paymentId
      ? prisma.payment.findUnique({ where: { id: paymentId }, select: { origin: true } })
      : null,
  ])
  if (!subscription?.plan || subscription.plan.isPromo || subscription.plan.priceKopecks <= 0) return
  const subscriptionDeviceLimit = subscription.deviceLimit ?? subscription.plan.deviceLimit
  const currentPricing = tryCalculateAutoRenewalPurchase(subscription.plan, subscriptionDeviceLimit)
  const addonConfigurationValid = !setting.whitelistAddonEnabled || (
    subscription.plan.whitelistAddonEnabled
    && subscription.plan.whitelistAddonPriceKopecks > 0
    && subscription.plan.whitelistAddonInternalSquads.length > 0
    && subscription.whitelistAddonActive
  )
  const currentPriceKopecks = currentPricing
    ? currentPricing.originalAmountKopecks
      + (setting.whitelistAddonEnabled ? subscription.plan.whitelistAddonPriceKopecks : 0)
    : null
  const consentCurrent = (
    setting.planId === subscription.plan.id
    && setting.deviceLimit === subscriptionDeviceLimit
    && addonConfigurationValid
    && setting.consentPriceKopecks === currentPriceKopecks
    && setting.consentDurationDays === subscription.plan.durationDays
  )
  await prisma.autoRenewal.update({
    where: { id: setting.id },
    data: {
      planId: subscription.plan.id,
      status: consentCurrent ? 'ACTIVE' : 'PAUSED',
      nextChargeAt: consentCurrent ? chargeAt(subscription.expireAt) : null,
      retryCount: 0,
      lastSuccessAt: payment?.origin === 'AUTO_RENEWAL' ? new Date() : setting.lastSuccessAt,
      lastFailurePaymentId: null,
      lastError: consentCurrent ? null : 'Условия тарифа изменились. Требуется новое согласие на автопродление.',
    },
  })
}

export async function registerAutoRenewalFailure(paymentId: string, reason: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { autoRenewalId: true, userId: true },
  })
  if (!payment?.autoRenewalId) return
  const setting = await prisma.autoRenewal.findUnique({ where: { id: payment.autoRenewalId } })
  if (!setting || setting.status === 'DISABLED') return
  if (setting.lastFailurePaymentId === paymentId) return
  const retryCount = setting.retryCount + 1
  const delay = RETRY_DELAYS_HOURS[retryCount - 1]
  const paused = delay == null
  await prisma.autoRenewal.update({
    where: { id: setting.id },
    data: {
      status: paused ? 'PAUSED' : 'RETRYING',
      retryCount,
      nextChargeAt: paused ? null : new Date(Date.now() + delay * HOUR_MS),
      lastFailurePaymentId: paymentId,
      lastError: reason.slice(0, 1000),
    },
  })
  await notifyUser({
    userId: payment.userId,
    type: 'PAYMENT_FAILED',
    dedupeKey: `auto-renewal-failed:${paymentId}`,
    title: paused ? 'Автопродление приостановлено' : 'Автопродление не прошло',
    body: paused
      ? 'Три попытки списания не прошли. Выберите тариф и оплатите его вручную.'
      : `Повторим списание автоматически через ${delay} ч.`,
    actionHref: '/dashboard/billing',
    actionLabel: 'Управлять автопродлением',
  })
}

export async function registerAutoRenewalFailureBestEffort(paymentId: string, reason: string) {
  try {
    await registerAutoRenewalFailure(paymentId, reason)
  } catch (error) {
    logError('auto_renewal.failure_registration_failed', error, { paymentId })
  }
}

export async function processDueAutoRenewals(options?: { limit?: number; shouldStop?: () => boolean }) {
  const settings = await prisma.autoRenewal.findMany({
    where: {
      status: { in: ['ACTIVE', 'RETRYING'] },
      nextChargeAt: { lte: new Date() },
      paymentMethodIdEncrypted: { not: null },
      consentAcceptedAt: { not: null },
      consentVersion: AUTO_RENEWAL_CONSENT_VERSION,
      consentPriceKopecks: { not: null },
      consentDurationDays: { not: null },
    },
    orderBy: { nextChargeAt: 'asc' },
    take: options?.limit ?? 20,
    include: { user: { select: { id: true, email: true } }, plan: true },
  })
  let created = 0
  let failed = 0
  for (const setting of settings) {
    if (options?.shouldStop?.()) break
    try {
      const payment = await createAutoRenewalPayment(setting)
      if (payment) created += 1
    } catch (error) {
      failed += 1
      logError('auto_renewal.create_failed', error, { autoRenewalId: setting.id, userId: setting.userId })
    }
  }
  return { checked: settings.length, created, failed }
}

async function createAutoRenewalPayment(setting: DueAutoRenewal) {
  const pricing = tryCalculateAutoRenewalPurchase(setting.plan, setting.deviceLimit)
  const addonConfigurationValid = !setting.whitelistAddonEnabled || (
    setting.plan.whitelistAddonEnabled
    && setting.plan.whitelistAddonPriceKopecks > 0
    && setting.plan.whitelistAddonInternalSquads.length > 0
  )
  const totalAmountKopecks = pricing
    ? pricing.originalAmountKopecks
      + (setting.whitelistAddonEnabled ? setting.plan.whitelistAddonPriceKopecks : 0)
    : null
  if (
    !pricing
    || !addonConfigurationValid
    || setting.consentPriceKopecks !== totalAmountKopecks
    || setting.consentDurationDays !== setting.plan.durationDays
  ) {
    await prisma.autoRenewal.update({
      where: { id: setting.id },
      data: {
        status: 'PAUSED',
        nextChargeAt: null,
        lastError: 'Условия тарифа изменились. Требуется новое согласие на автопродление.',
      },
    })
    await notifyUser({
      userId: setting.userId,
      type: 'PAYMENT_FAILED',
      dedupeKey: `auto-renewal-consent-outdated:${setting.id}:${setting.plan.updatedAt.toISOString()}`,
      title: 'Автопродление требует подтверждения',
      body: 'Цена или срок тарифа изменились. Откройте платежи и подтвердите новые условия.',
      actionHref: '/dashboard/billing',
      actionLabel: 'Подтвердить условия',
    })
    return null
  }
  const scheduledAt = setting.nextChargeAt ?? new Date()
  const checkoutKey = `auto:${setting.id}:${scheduledAt.toISOString()}:${setting.retryCount}`
  const existing = await prisma.payment.findUnique({
    where: { userId_checkoutKey: { userId: setting.userId, checkoutKey } },
  })
  if (existing) return existing

  const localPayment = await prisma.$transaction(async (tx) => {
    const planSnapshot = buildPlanPurchaseSnapshot(setting.plan, pricing)
    const addonSnapshot = setting.whitelistAddonEnabled
      ? buildBundledWhitelistAddonSnapshot({
          planId: setting.plan.id,
          priceKopecks: setting.plan.whitelistAddonPriceKopecks,
          internalSquads: setting.plan.whitelistAddonInternalSquads,
        })
      : null
    const payment = await tx.payment.create({
      data: {
        userId: setting.userId,
        planId: setting.planId,
        autoRenewalId: setting.id,
        amountKopecks: totalAmountKopecks!,
        originalAmountKopecks: totalAmountKopecks!,
        deviceLimit: pricing.selectedDeviceLimit,
        planSnapshot: planSnapshot as unknown as Prisma.InputJsonValue,
        ...(addonSnapshot
          ? { addonSnapshot: addonSnapshot as unknown as Prisma.InputJsonValue }
          : {}),
        provider: 'YOOKASSA',
        origin: 'AUTO_RENEWAL',
        providerStatus: 'pending',
        checkoutKey,
      },
    })
    await tx.autoRenewal.update({
      where: { id: setting.id },
      data: { status: 'PROCESSING', nextChargeAt: null, lastAttemptAt: new Date(), lastError: null },
    })
    return payment
  })

  try {
    const providerPayment = await createPayment({
      amount: localPayment.amountKopecks / 100,
      description: `${buildPaymentServiceName(setting.plan.durationDays)}${setting.whitelistAddonEnabled ? ' + белые списки' : ''}`,
      returnUrl: `${getAppUrl()}/dashboard/billing`,
      paymentMethodId: decryptPaymentSecret(setting.paymentMethodIdEncrypted!),
      metadata: {
        userId: setting.userId,
        planId: setting.planId,
        localPaymentId: localPayment.id,
        autoRenewalId: setting.id,
        deviceLimit: String(pricing.selectedDeviceLimit),
        ...(setting.whitelistAddonEnabled ? { whitelistAddon: 'true' } : {}),
      },
      idempotenceKey: localPayment.id,
    })
    await prisma.payment.update({
      where: { id: localPayment.id },
      data: {
        yookassaId: providerPayment.id,
        yookassaStatus: providerPayment.status as YookassaPaymentStatus,
        externalPaymentId: providerPayment.id,
        providerStatus: providerPayment.status,
      },
    })
    if (providerPayment.status === 'canceled') {
      await prisma.payment.update({ where: { id: localPayment.id }, data: { status: 'CANCELED' } })
      await registerAutoRenewalFailure(
        localPayment.id,
        providerPayment.cancellation_details?.reason ?? 'ЮKassa отклонила автоплатёж'
      )
    }
    logInfo('auto_renewal.payment_created', { autoRenewalId: setting.id, paymentId: localPayment.id })
    return localPayment
  } catch (error) {
    await prisma.payment.update({
      where: { id: localPayment.id },
      data: { status: 'CANCELED', providerStatus: 'create_failed', provisioningError: errorMessage(error) },
    })
    await registerAutoRenewalFailure(localPayment.id, errorMessage(error))
    throw error
  }
}

export function calculateAutoRenewalPurchase(
  plan: Pick<DevicePricedPlan, 'priceKopecks' | 'deviceLimit' | 'maxDeviceLimit' | 'extraDevicePriceKopecks'>,
  deviceLimit: number
) {
  return calculatePlanPurchase(plan, deviceLimit)
}

function tryCalculateAutoRenewalPurchase(
  plan: Pick<DevicePricedPlan, 'priceKopecks' | 'deviceLimit' | 'maxDeviceLimit' | 'extraDevicePriceKopecks'>,
  deviceLimit: number
) {
  try {
    return calculateAutoRenewalPurchase(plan, deviceLimit)
  } catch {
    return null
  }
}

function chargeAt(expireAt: Date) {
  const leadHours = positiveInteger(process.env.AUTO_RENEWAL_LEAD_HOURS) ?? DEFAULT_LEAD_HOURS
  return new Date(Math.max(Date.now(), expireAt.getTime() - leadHours * HOUR_MS))
}

function paymentMethodTitle(method: NonNullable<YooPayment['payment_method']>) {
  if (method.title?.trim()) return method.title.trim().slice(0, 100)
  if (method.card?.last4) return `${method.card.card_type || 'Карта'} •••• ${method.card.last4}`.slice(0, 100)
  return method.type === 'sbp' ? 'СБП' : 'Сохранённый способ оплаты'
}

function positiveInteger(value: string | undefined) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : 'Неизвестная ошибка автопродления'
}

export function autoRenewalStatusLabel(status: AutoRenewalStatus) {
  if (status === 'AWAITING_PAYMENT_METHOD') return 'Ожидает следующую оплату картой'
  if (status === 'ACTIVE') return 'Включено'
  if (status === 'PROCESSING') return 'Выполняется списание'
  if (status === 'RETRYING') return 'Ожидает повторной попытки'
  if (status === 'PAUSED') return 'Приостановлено'
  return 'Выключено'
}
