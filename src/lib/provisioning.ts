import { prisma } from './prisma'
import { ensureRemnawaveSubscription, type EnsureSubscriptionInput } from './subscription'
import { applyPendingReferralRewardsForUser, grantReferralRewardForPayment } from './referral-rewards'
import { grantPaymentBonusBoxAttempts, grantReferralBonusBoxAttemptsForPayment } from './bonus-box'
import { notifyPaymentSucceeded } from './notifications'
import { syncCabinetPaymentToRemnashopBestEffort } from './remnashop-reverse-sync'
import { logError } from './logger'
import { paymentErrorDetails, recordPaymentEvent } from './payment-events'
import { refreshAutoRenewalSchedule } from './auto-renewal'

export interface ProvisionPaymentSubscriptionInput extends EnsureSubscriptionInput {
  paymentId: string
}

export async function provisionPaymentSubscription(input: ProvisionPaymentSubscriptionInput) {
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    include: {
      subscription: true,
      provisioningJob: true,
    },
  })

  if (payment?.subscriptionProvisionedAt && payment.subscription) {
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

    await settleReferralRewards(input.paymentId, input.userId)
    await syncCabinetPaymentToRemnashopBestEffort(input.paymentId)
    await notifyPaymentSuccessBestEffort(input.paymentId)
    await refreshAutoRenewalScheduleBestEffort(input.userId, input.paymentId)
    await recordPaymentEvent({
      paymentId: input.paymentId,
      stage: 'PROVISIONING',
      status: 'SUCCESS',
      source: 'provisioning',
      message: 'Подписка уже была выдана, повторная операция не потребовалась',
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
    message: `Запущена выдача подписки, попытка ${job.attempts}`,
    details: { attempt: job.attempts },
    dedupeKey: `provisioning-attempt-${job.attempts}`,
  })

  try {
    const result = await ensureRemnawaveSubscription(input)
    await prisma.provisioningJob.update({
      where: { id: job.id },
      data: {
        status: 'SUCCEEDED',
        nextRetryAt: null,
        lockedAt: null,
        lastError: null,
      },
    })
    await settleReferralRewards(input.paymentId, input.userId)
    await syncCabinetPaymentToRemnashopBestEffort(input.paymentId)
    await notifyPaymentSuccessBestEffort(input.paymentId)
    await refreshAutoRenewalScheduleBestEffort(input.userId, input.paymentId)
    await recordPaymentEvent({
      paymentId: input.paymentId,
      stage: 'PROVISIONING',
      status: 'SUCCESS',
      source: 'provisioning',
      message: 'Подписка успешно выдана',
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
      message: 'Не удалось выдать подписку, назначен автоматический повтор',
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
