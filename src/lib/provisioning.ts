import { prisma } from './prisma'
import { ensureRemnawaveSubscription, type EnsureSubscriptionInput } from './subscription'
import { applyPendingReferralRewardsForUser, grantReferralRewardForPayment } from './referral-rewards'
import { grantPaymentBonusBoxAttempts, grantReferralBonusBoxAttemptsForPayment } from './bonus-box'
import { notifyPaymentSucceeded } from './notifications'
import { syncCabinetPaymentToRemnashopBestEffort } from './remnashop-reverse-sync'
import { logError } from './logger'
import { paymentErrorDetails, recordPaymentEvent } from './payment-events'
import { refreshAutoRenewalSchedule } from './auto-renewal'
import { trimUserDevicesToLimit } from './hwid-device-limit'
import { readPlanPurchaseSnapshot } from './plan-purchase'
import { provisionWhitelistAddon, readBundledWhitelistAddonSnapshot } from './whitelist-addon'

export interface ProvisionPaymentSubscriptionInput extends EnsureSubscriptionInput {
  paymentId: string
}

export async function provisionPaymentSubscription(input: ProvisionPaymentSubscriptionInput) {
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    include: {
      subscription: true,
      provisioningJob: true,
      plan: true,
    },
  })
  if (!payment) throw new Error(`Payment ${input.paymentId} not found`)
  const isWhitelistAddon = payment.purchaseType === 'WHITELIST_ADDON'

  const purchaseSnapshot = readPlanPurchaseSnapshot(payment.planSnapshot)
  const bundledWhitelistAddon = readBundledWhitelistAddonSnapshot(payment.addonSnapshot)
  const effectiveInput = {
    ...input,
    whitelistAddon: bundledWhitelistAddon
      ? { internalSquads: bundledWhitelistAddon.internalSquads }
      : undefined,
    plan: purchaseSnapshot
      ? {
          id: purchaseSnapshot.id,
          name: purchaseSnapshot.name,
          durationDays: purchaseSnapshot.durationDays,
          trafficLimitGb: purchaseSnapshot.trafficLimitGb,
          deviceLimit: purchaseSnapshot.selectedDeviceLimit,
          activeInternalSquads: purchaseSnapshot.activeInternalSquads,
        }
      : {
          ...input.plan,
          deviceLimit: payment.deviceLimit ?? input.plan.deviceLimit,
        },
  }

  if (payment?.subscriptionProvisionedAt && payment.subscription) {
    if (!isWhitelistAddon) {
      await trimPurchasedDevices({
        paymentId: input.paymentId,
        userId: input.userId,
        deviceLimit: effectiveInput.plan.deviceLimit,
        enabled: purchaseSnapshot?.deviceLimitSelectionConfirmed === true,
      })
    }
    await prisma.provisioningJob.upsert({
      where: { paymentId: input.paymentId },
      create: {
        paymentId: input.paymentId,
        status: 'SUCCEEDED',
        attempts: 0,
      },
      update: {
        status: 'SUCCEEDED',
        nextRetryAt: null,
        lockedAt: null,
        lastError: null,
      },
    })

    if (!isWhitelistAddon) {
      await settleReferralRewards(input.paymentId, input.userId)
      await syncCabinetPaymentToRemnashopBestEffort(input.paymentId)
      await refreshAutoRenewalScheduleBestEffort(input.userId, input.paymentId)
    }
    await notifyPaymentSuccessBestEffort(input.paymentId)
    await recordPaymentEvent({
      paymentId: input.paymentId,
      stage: 'PROVISIONING',
      status: 'SUCCESS',
      source: 'provisioning',
      message: isWhitelistAddon
        ? 'Дополнение уже было выдано, повторная операция не потребовалась'
        : 'Подписка уже была выдана, повторная операция не потребовалась',
      dedupeKey: 'provisioning-idempotent',
    })

    return {
      subscription: payment.subscription,
      remnawaveUser: null,
      isNew: false,
      idempotent: true,
      jobStatus: 'SUCCEEDED' as const,
    }
  }

  const job = await prisma.provisioningJob.upsert({
    where: { paymentId: input.paymentId },
    create: {
      paymentId: input.paymentId,
      status: 'RUNNING',
      attempts: 1,
      lockedAt: new Date(),
      lastError: null,
    },
    update: {
      status: 'RUNNING',
      attempts: { increment: 1 },
      lockedAt: new Date(),
      lastError: null,
    },
  })

  await recordPaymentEvent({
    paymentId: input.paymentId,
    stage: 'PROVISIONING',
    status: 'INFO',
    source: 'provisioning',
    message: `${isWhitelistAddon ? 'Запущена выдача дополнения' : 'Запущена выдача подписки'}, попытка ${job.attempts}`,
    details: { attempt: job.attempts },
    dedupeKey: `provisioning-attempt-${job.attempts}`,
  })

  try {
    const result = isWhitelistAddon
      ? await provisionWhitelistAddon(input.paymentId)
      : await ensureRemnawaveSubscription(effectiveInput)
    if (!isWhitelistAddon) {
      await trimPurchasedDevices({
        paymentId: input.paymentId,
        userId: input.userId,
        deviceLimit: effectiveInput.plan.deviceLimit,
        enabled: purchaseSnapshot?.deviceLimitSelectionConfirmed === true,
      })
    }
    await prisma.provisioningJob.update({
      where: { id: job.id },
      data: {
        status: 'SUCCEEDED',
        nextRetryAt: null,
        lockedAt: null,
        lastError: null,
      },
    })
    if (!isWhitelistAddon) {
      await settleReferralRewards(input.paymentId, input.userId)
      await syncCabinetPaymentToRemnashopBestEffort(input.paymentId)
      await refreshAutoRenewalScheduleBestEffort(input.userId, input.paymentId)
    }
    await notifyPaymentSuccessBestEffort(input.paymentId)
    await recordPaymentEvent({
      paymentId: input.paymentId,
      stage: 'PROVISIONING',
      status: 'SUCCESS',
      source: 'provisioning',
      message: isWhitelistAddon ? 'Дополнение успешно выдано' : 'Подписка успешно выдана',
      details: { attempt: job.attempts },
      dedupeKey: 'provisioning-succeeded',
    })
    return { ...result, jobStatus: 'SUCCEEDED' as const }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'subscription provisioning failed'
    const nextRetryAt = computeNextRetryAt(job.attempts)
    await prisma.provisioningJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        nextRetryAt,
        lockedAt: null,
        lastError: message.slice(0, 1000),
      },
    })
    await recordPaymentEvent({
      paymentId: input.paymentId,
      stage: 'PROVISIONING',
      status: 'ERROR',
      source: 'provisioning',
      message: isWhitelistAddon
        ? 'Не удалось выдать дополнение, назначен автоматический повтор'
        : 'Не удалось выдать подписку, назначен автоматический повтор',
      details: paymentErrorDetails(e, { attempt: job.attempts, nextRetryAt }),
      dedupeKey: `provisioning-failed-${job.attempts}`,
    })
    throw e
  }
}

async function refreshAutoRenewalScheduleBestEffort(userId: string, paymentId: string) {
  try {
    await refreshAutoRenewalSchedule(userId, paymentId)
  } catch (error) {
    logError('auto_renewal.schedule_refresh_failed', error, { userId })
  }
}

async function trimPurchasedDevices(input: {
  paymentId: string
  userId: string
  deviceLimit: number
  enabled: boolean
}) {
  if (!input.enabled) return
  const result = await trimUserDevicesToLimit({
    localUserId: input.userId,
    deviceLimit: input.deviceLimit,
  })
  if (result.removed > 0) {
    await recordPaymentEvent({
      paymentId: input.paymentId,
      stage: 'PROVISIONING',
      status: 'INFO',
      source: 'provisioning',
      message: `Отвязаны давно неактивные устройства: ${result.removed}`,
      details: { deviceLimit: input.deviceLimit, removedDevices: result.removed },
      dedupeKey: `devices-trimmed-${input.deviceLimit}`,
    })
  }
}

async function settleReferralRewards(paymentId: string, userId: string) {
  try {
    await grantPaymentBonusBoxAttempts(paymentId)
    await grantReferralRewardForPayment(paymentId)
    await grantReferralBonusBoxAttemptsForPayment(paymentId)
    await applyPendingReferralRewardsForUser(userId)
  } catch (error) {
    logError('provisioning.settlement_failed', error, {
      paymentId,
      userId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
  }
}

async function notifyPaymentSuccessBestEffort(paymentId: string) {
  try {
    await notifyPaymentSucceeded(paymentId)
  } catch (error) {
    logError('provisioning.payment_notification_failed', error, {
      paymentId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    await recordPaymentEvent({
      paymentId,
      stage: 'NOTIFICATION',
      status: 'ERROR',
      source: 'provisioning',
      message: 'Подписка выдана, но уведомление не отправлено',
      details: paymentErrorDetails(error),
      dedupeKey: 'notification-payment-success-failed',
    })
  }
}

function computeNextRetryAt(attempts: number) {
  const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.min(attempts, 5)))
  return new Date(Date.now() + delayMinutes * 60 * 1000)
}
