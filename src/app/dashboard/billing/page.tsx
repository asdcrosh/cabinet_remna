// /dashboard/billing — история платежей + банер «оплата прошла».

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/dashboard/page-header'
import { PaymentSuccessBanner } from '@/components/dashboard/payment-success-banner'
import { PaymentHistory } from '@/components/dashboard/payment-history'
import {
  getPendingPaymentTtlMs,
  syncPaymentProvisioning,
  type PaymentSyncResult,
} from '@/lib/payment-sync'
import { getFeatureFlags } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'
const PAGE_SIZE = 20

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; payment?: string; page?: string }>
}) {
  const params = await searchParams
  const features = getFeatureFlags()
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const returnPaymentId = typeof params.payment === 'string' ? params.payment : null
  const requestedPage = Number(params.page)
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const syncResult =
    params.paid === '1' && returnPaymentId
      ? await syncPaymentProvisioning({
          paymentId: returnPaymentId,
          userId: session.uid,
          cancelPendingOlderThanMs: getPendingPaymentTtlMs(),
        })
      : null
  const [total, payments] = await prisma.$transaction([
    prisma.payment.count({ where: { userId: session.uid } }),
    prisma.payment.findMany({
      where: { userId: session.uid },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { plan: true, subscription: true },
    }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="page-stack">
      <PageHeader
        title="Платежи"
        description="История оплат и состояние выдачи подписки"
        action={<Link href="/dashboard/plans" className="btn-primary">Выбрать тариф</Link>}
      />

      {params.paid === '1' && <PaymentSuccessBanner status={getBannerStatus(syncResult)} supportEnabled={features.support} />}

      <PaymentHistory payments={payments} />

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Страницы платежей">
          {page > 1
            ? <Link href={`/dashboard/billing?page=${page - 1}`} className="btn-secondary">Назад</Link>
            : <span />}
          <span className="text-sm text-slate-500">Страница {Math.min(page, pages)} из {pages}</span>
          {page < pages
            ? <Link href={`/dashboard/billing?page=${page + 1}`} className="btn-secondary">Дальше</Link>
            : <span />}
        </nav>
      )}
    </div>
  )
}

function getBannerStatus(syncResult: PaymentSyncResult | null) {
  if (!syncResult) return 'processing'
  if (syncResult.status === 'succeeded' && syncResult.provisioned) return 'ready'
  if (!syncResult.ok || syncResult.status === 'canceled') return 'attention'
  return 'processing'
}
