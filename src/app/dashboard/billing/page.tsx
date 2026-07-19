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
import { ArrowRight, CreditCard } from 'lucide-react'

export const dynamic = 'force-dynamic'
const PAGE_SIZE = 20

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; payment?: string; page?: string }>
}) {
  const params = await searchParams
  const features = await getFeatureFlags()
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
        description="История оплат, статусы платежей и выдача подписки."
        action={(
          <Link href="/dashboard/plans" className="btn-primary group w-full justify-between px-4 sm:w-auto sm:gap-3">
            <span className="inline-flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Выбрать тариф
            </span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      />

      {params.paid === '1' && <PaymentSuccessBanner status={getBannerStatus(syncResult)} supportEnabled={features.support} />}

      <PaymentHistory payments={payments} />

      {pages > 1 && (
        <nav className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 dark:border-white/[0.09] dark:bg-white/[0.03] sm:gap-3" aria-label="Страницы платежей">
          {page > 1
            ? <Link href={`/dashboard/billing?page=${page - 1}`} className="btn-secondary min-h-10 justify-self-start px-3 py-2">Назад</Link>
            : <span />}
          <span className="text-center text-xs font-medium text-slate-500 sm:text-sm">{Math.min(page, pages)} из {pages}</span>
          {page < pages
            ? <Link href={`/dashboard/billing?page=${page + 1}`} className="btn-secondary min-h-10 justify-self-end px-3 py-2">Дальше</Link>
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
