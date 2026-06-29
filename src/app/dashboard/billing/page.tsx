// /dashboard/billing — история платежей + банер «оплата прошла».

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatPrice } from '@/lib/format'
import { PageHeader } from '@/components/dashboard/page-header'
import { PaymentSuccessBanner } from '@/components/dashboard/payment-success-banner'
import { EmptyState } from '@/components/dashboard/empty-state'
import {
  getPendingPaymentTtlMs,
  reconcileStalePendingPaymentsForUser,
  syncPaymentProvisioning,
  type PaymentSyncResult,
} from '@/lib/payment-sync'
import { ExternalLink } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function BillingPage({ searchParams }: { searchParams: { paid?: string; payment?: string } }) {
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const returnPaymentId = typeof searchParams.payment === 'string' ? searchParams.payment : null
  await reconcileStalePendingPaymentsForUser(session.uid)
  const syncResult =
    searchParams.paid === '1' && returnPaymentId
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
    <div className="space-y-6">
      <PageHeader title="Платежи" description="История оплат и состояние выдачи подписки" />

      {searchParams.paid === '1' && <PaymentSuccessBanner status={getBannerStatus(syncResult)} />}

      <div className="table-shell hidden xl:block">
        <table className="data-table min-w-[900px]">
          <thead className="bg-slate-50 dark:bg-surface-800 text-left text-slate-500">
            <tr>
              <th>Дата</th>
              <th>Тариф</th>
              <th>Сумма</th>
              <th>Промокод</th>
              <th>Статус</th>
              <th>Подписка</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {payments.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10">
                  <div className="mx-auto max-w-md text-center">
                    <div className="text-base font-semibold text-slate-900 dark:text-white">Платежей пока нет</div>
                    <p className="mt-1 text-sm text-slate-500">
                      После покупки здесь появятся сумма, статус и выданная подписка.
                    </p>
                    <Link href="/dashboard/plans" className="btn-primary mt-4 inline-flex">
                      Выбрать тариф
                    </Link>
                  </div>
                </td>
              </tr>
            )}
            {payments.map((p) => (
              <tr key={p.id}>
                <td>
                  {new Date(p.createdAt).toLocaleString('ru-RU')}
                </td>
                <td>{p.plan.name}</td>
                <td>
                  <PaymentAmount
                    amountKopecks={p.amountKopecks}
                    originalAmountKopecks={p.originalAmountKopecks}
                    discountKopecks={p.discountKopecks}
                  />
                </td>
                <td className="text-slate-500">{getPromoCodeLabel(p.promoCodeSnapshot)}</td>
                <td>
                  <PaymentStatusBadge status={p.status} createdAt={p.createdAt} />
                </td>
                <td>
                  <ProvisioningBadge provisioned={Boolean(p.subscriptionProvisionedAt)} status={p.status} />
                </td>
                <td>
                  <PaymentAction confirmationUrl={p.confirmationUrl} status={p.status} createdAt={p.createdAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 xl:hidden">
        {payments.length === 0 && (
          <EmptyState
            title="Платежей пока нет"
            description="После первой покупки здесь появится история оплат и состояние выдачи подписки."
            action={<Link href="/dashboard/plans" className="btn-primary">Выбрать тариф</Link>}
          />
        )}
        {payments.map((p) => (
          <article key={p.id} className="overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-surface-900">
            <div className="border-b bg-slate-50 px-4 py-3 dark:bg-surface-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{p.plan.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{formatPaymentDate(p.createdAt)}</div>
                </div>
                <PaymentStatusBadge status={p.status} createdAt={p.createdAt} />
              </div>
            </div>
            <div className="space-y-3 px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs uppercase tracking-wide text-slate-400">Сумма</span>
                <PaymentAmount
                  amountKopecks={p.amountKopecks}
                  originalAmountKopecks={p.originalAmountKopecks}
                  discountKopecks={p.discountKopecks}
                  align="right"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <InfoCell label="Подписка" value={getProvisioningLabel(Boolean(p.subscriptionProvisionedAt), p.status)} />
                <InfoCell label="Промокод" value={getPromoCodeLabel(p.promoCodeSnapshot)} />
                <InfoCell label="ID оплаты" value={p.yookassaId ? shortId(p.yookassaId) : shortId(p.id)} mono />
              </div>
              <PaymentAction confirmationUrl={p.confirmationUrl} status={p.status} createdAt={p.createdAt} fullWidth />
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function getBannerStatus(syncResult: PaymentSyncResult | null) {
  if (!syncResult) return 'processing'
  if (syncResult.status === 'succeeded' && syncResult.provisioned) return 'ready'
  if (!syncResult.ok || syncResult.status === 'canceled') return 'attention'
  return 'processing'
}

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="info-cell">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={mono ? 'mt-1 truncate font-mono text-xs' : 'mt-1 truncate font-medium'}>{value}</div>
    </div>
  )
}

function PaymentAmount({
  amountKopecks,
  originalAmountKopecks,
  discountKopecks,
  align = 'left',
}: {
  amountKopecks: number
  originalAmountKopecks: number | null
  discountKopecks: number
  align?: 'left' | 'right'
}) {
  const hasDiscount = discountKopecks > 0 && originalAmountKopecks != null

  return (
    <div className={align === 'right' ? 'text-right' : undefined}>
      <div className="font-medium">{formatPrice(amountKopecks)}</div>
      {hasDiscount && (
        <div className="text-xs text-slate-400">
          <span className="line-through">{formatPrice(originalAmountKopecks)}</span>
          <span className="ml-1 text-emerald-600">-{formatPrice(discountKopecks)}</span>
        </div>
      )}
    </div>
  )
}

function getPromoCodeLabel(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return '—'
  const code = (snapshot as { code?: unknown }).code
  return typeof code === 'string' && code ? code : '—'
}

function formatPaymentDate(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getProvisioningLabel(provisioned: boolean, status: string) {
  if (provisioned) return 'Выдана'
  if (status === 'SUCCEEDED') return 'Выдача идет'
  if (status === 'PENDING') return 'После оплаты'
  return '—'
}

function ProvisioningBadge({ provisioned, status }: { provisioned: boolean; status: string }) {
  if (provisioned) return <span className="badge-active">Выдана</span>
  if (status === 'SUCCEEDED') return <span className="badge-limited">Выдача идет</span>
  if (status === 'PENDING') return <span className="badge-disabled">После оплаты</span>
  return <span className="text-slate-400">—</span>
}

function PaymentAction({
  confirmationUrl,
  status,
  createdAt,
  fullWidth = false,
}: {
  confirmationUrl: string | null
  status: string
  createdAt: Date
  fullWidth?: boolean
}) {
  if (status === 'PENDING' && !isFreshPendingPayment(createdAt)) {
    return <span className="text-sm text-slate-400">Ссылка устарела</span>
  }
  if (status !== 'PENDING' || !confirmationUrl) return <span className="text-sm text-slate-400">—</span>
  return (
    <a
      href={confirmationUrl}
      className={`btn-secondary min-h-9 px-3 py-1.5 text-xs ${fullWidth ? 'w-full' : ''}`}
      target="_blank"
      rel="noreferrer"
    >
      <ExternalLink className="h-4 w-4" />
      Оплатить
    </a>
  )
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

function PaymentStatusBadge({ status, createdAt }: { status: string; createdAt: Date }) {
  if (status === 'PENDING' && !isFreshPendingPayment(createdAt)) {
    return <span className="badge-disabled">Истёк</span>
  }
  const map: Record<string, string> = {
    SUCCEEDED: 'badge-active',
    PENDING: 'badge-limited',
    CANCELED: 'badge-disabled',
    REFUNDED: 'badge-disabled',
  }
  const labels: Record<string, string> = {
    SUCCEEDED: 'Оплачен',
    PENDING: 'Ожидает',
    CANCELED: 'Отменён',
    REFUNDED: 'Возврат',
  }
  return <span className={map[status] ?? 'badge-disabled'}>{labels[status] ?? status}</span>
}

function isFreshPendingPayment(createdAt: Date) {
  return createdAt.getTime() > Date.now() - getPendingPaymentTtlMs()
}
