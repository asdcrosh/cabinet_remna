import { prisma } from './prisma'
import { recordPaymentEvent } from './payment-events'
import { revokeWhitelistAddonForPayment } from './whitelist-addon'

interface RecordSucceededRefundInput {
  paymentId: string
  providerRefundId: string
  amountKopecks: number
  paymentAmountKopecks: number
  providerStatus: string
}

export async function recordSucceededRefund(input: RecordSucceededRefundInput) {
  if (!Number.isInteger(input.amountKopecks) || input.amountKopecks <= 0) {
    throw new Error('Refund amount must be a positive integer')
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.paymentRefund.upsert({
      where: { providerRefundId: input.providerRefundId },
      create: {
        paymentId: input.paymentId,
        providerRefundId: input.providerRefundId,
        amountKopecks: input.amountKopecks,
      },
      update: {},
    })

    const aggregate = await tx.paymentRefund.aggregate({
      where: { paymentId: input.paymentId },
      _sum: { amountKopecks: true },
    })
    const refundedAmountKopecks = aggregate._sum.amountKopecks ?? 0
    const fullyRefunded = refundedAmountKopecks >= input.paymentAmountKopecks

    if (fullyRefunded) {
      await tx.payment.update({
        where: { id: input.paymentId },
        data: {
          status: 'REFUNDED',
          providerStatus: input.providerStatus,
        },
      })
      await tx.promoCodeRedemption.updateMany({
        where: {
          paymentId: input.paymentId,
          status: { in: ['PENDING', 'SUCCEEDED'] },
        },
        data: { status: 'CANCELED' },
      })
    }

    return { fullyRefunded, refundedAmountKopecks }
  })

  let benefitReview: Awaited<ReturnType<typeof revokeRefundBenefits>> | null = null
  if (result.fullyRefunded) {
    await revokeWhitelistAddonForPayment(input.paymentId)
    benefitReview = await revokeRefundBenefits(input.paymentId)
  }

  await recordPaymentEvent({
    paymentId: input.paymentId,
    stage: 'REFUND',
    status: result.fullyRefunded ? 'WARNING' : 'INFO',
    source: 'refund',
    message: result.fullyRefunded ? 'Полный возврат подтверждён' : 'Частичный возврат подтверждён',
    details: {
      providerRefundId: input.providerRefundId,
      amountKopecks: input.amountKopecks,
      refundedAmountKopecks: result.refundedAmountKopecks,
      fullyRefunded: result.fullyRefunded,
      benefitReview,
    },
    dedupeKey: `refund-${input.providerRefundId}`,
  })

  return result
}

async function revokeRefundBenefits(paymentId: string) {
  const paymentAttemptsUsed = await prisma.bonusBoxAttempt.count({
    where: {
      source: 'PAYMENT',
      sourceKey: { startsWith: `${paymentId}:` },
      usedAt: { not: null },
    },
  })
  const paymentAttemptsDeleted = await prisma.bonusBoxAttempt.deleteMany({
    where: {
      source: 'PAYMENT',
      sourceKey: { startsWith: `${paymentId}:` },
      usedAt: null,
    },
  })
  const reward = await prisma.referralReward.findUnique({
    where: { triggeringPaymentId: paymentId },
    select: {
      id: true,
      appliedAt: true,
      referredAppliedAt: true,
    },
  })
  if (!reward) {
    return {
      paymentAttemptsDeleted: paymentAttemptsDeleted.count,
      paymentAttemptsUsed,
      referralRewardRevoked: false,
      manualReview: paymentAttemptsUsed > 0,
    }
  }

  const referralAttemptWhere = {
    source: 'REFERRAL' as const,
    OR: [
      { sourceKey: { startsWith: `referrer:${reward.id}:` } },
      { sourceKey: { startsWith: `referred:${reward.id}:` } },
    ],
  }
  const referralAttemptsUsed = await prisma.bonusBoxAttempt.count({
    where: { ...referralAttemptWhere, usedAt: { not: null } },
  })
  const referralAttemptsDeleted = await prisma.bonusBoxAttempt.deleteMany({
    where: { ...referralAttemptWhere, usedAt: null },
  })
  const appliedDays = Boolean(reward.appliedAt || reward.referredAppliedAt)
  const canRevokeReward = !appliedDays && referralAttemptsUsed === 0
  if (canRevokeReward) {
    await prisma.referralReward.delete({ where: { id: reward.id } })
  } else {
    await prisma.referralReward.update({
      where: { id: reward.id },
      data: {
        lastError: 'Платёж-триггер возвращён; применённые дни или использованные призы требуют ручной сверки.',
      },
    })
  }

  return {
    paymentAttemptsDeleted: paymentAttemptsDeleted.count,
    paymentAttemptsUsed,
    referralAttemptsDeleted: referralAttemptsDeleted.count,
    referralAttemptsUsed,
    referralRewardRevoked: canRevokeReward,
    manualReview: paymentAttemptsUsed > 0 || !canRevokeReward,
  }
}
