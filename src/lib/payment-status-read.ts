import { prisma } from './prisma'
import { getStoredPaymentBannerStatus, type PaymentBannerStatus } from './payment-status-presentation'

export async function readPaymentBannerStatus(paymentId: string, userId: string): Promise<PaymentBannerStatus> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, userId },
    select: {
      status: true,
      subscriptionProvisionedAt: true,
      provisioningError: true,
      provisioningJob: { select: { status: true } },
    },
  })

  return getStoredPaymentBannerStatus(payment)
}
