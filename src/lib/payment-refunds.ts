import { prisma } from './prisma'
import { recordPaymentEvent } from './payment-events'

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
    },
    dedupeKey: `refund-${input.providerRefundId}`,
  })

  return result
}
