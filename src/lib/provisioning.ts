import { prisma } from './prisma'
import { ensureRemnawaveSubscription, type EnsureSubscriptionInput } from './subscription'
import { applyPendingReferralRewardsForUser, grantReferralRewardForPayment } from './referral-rewards'
import { grantPaymentBonusBoxAttempts, grantReferralBonusBoxAttemptsForPayment } from './bonus-box'
import { notifyPaymentSucceeded } from './notifications'

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
    await notifyPaymentSucceeded(input.paymentId)

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
    await notifyPaymentSucceeded(input.paymentId)
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
    throw e
  }
}

async function settleReferralRewards(paymentId: string, userId: string) {
  try {
    await grantPaymentBonusBoxAttempts(paymentId)
    await grantReferralRewardForPayment(paymentId)
    await grantReferralBonusBoxAttemptsForPayment(paymentId)
    await applyPendingReferralRewardsForUser(userId)
  } catch (error) {
    console.error('[payment-benefits] settlement failed', {
      paymentId,
      userId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
  }
}

function computeNextRetryAt(attempts: number) {
  const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.min(attempts, 5)))
  return new Date(Date.now() + delayMinutes * 60 * 1000)
}
