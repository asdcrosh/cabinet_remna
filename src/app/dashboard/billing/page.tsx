// /dashboard/billing — история платежей + банер «оплата прошла».

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { PaymentSuccessBanner } from '@/components/dashboard/payment-success-banner'
import { PaymentHistory } from '@/components/dashboard/payment-history'
import {
  getPendingPaymentTtlMs,
  reconcileStalePendingPaymentsForUser,
  syncPaymentProvisioning,
  type PaymentSyncResult,
} from '@/lib/payment-sync'

export const dynamic = 'force-dynamic'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; payment?: string }>
}) {
  const params = await searchParams
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const returnPaymentId = typeof params.payment === 'string' ? params.payment : null
  await reconcileStalePendingPaymentsForUser(session.uid)
  const syncResult =
    params.paid === '1' && returnPaymentId
      ? await syncPaymentProvisioning({
          paymentId: returnPaymentId,
          userId: session.uid,
          cancelPendingOlderThanMs: getPendingPaymentTtlMs(),
        })
      : null
  const payments = await prisma.payment.findMany({
    where: { userId: session.uid },
    orderBy: { createdAt: 'desc' },
    include: { plan: true, subscription: true },
  })

  return (
    <div className="page-stack">
      <PageHeader title="Платежи" description="История оплат и состояние выдачи подписки" />

      {params.paid === '1' && <PaymentSuccessBanner status={getBannerStatus(syncResult)} />}

      <PaymentHistory payments={payments} />
    </div>
  )
}

function getBannerStatus(syncResult: PaymentSyncResult | null) {
  if (!syncResult) return 'processing'
  if (syncResult.status === 'succeeded' && syncResult.provisioned) return 'ready'
  if (!syncResult.ok || syncResult.status === 'canceled') return 'attention'
  return 'processing'
}
