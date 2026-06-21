import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatPrice } from '@/lib/format'
import { PageHeader } from '@/components/dashboard/page-header'
import { PaymentBadge, ProvisioningBadge } from '@/components/admin/admin-badges'
import { PaymentSyncButton, RecoveryActionButton } from '@/components/admin/recovery-actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Платежи — Админка' }

export default async function AdminPaymentsPage() {
  await requireAdminPage()

  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: { select: { id: true, email: true, name: true } },
      plan: true,
      subscription: true,
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Платежи" description="Все платежи, их статус и результат выдачи подписки" />

      <div className="table-shell hidden xl:block">
        <table className="data-table min-w-[1180px]">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-surface-800">
            <tr>
              <th className="w-[150px]">Дата</th>
              <th className="w-[250px]">Пользователь</th>
              <th className="w-[130px]">Тариф</th>
              <th className="w-[130px]">Сумма</th>
              <th className="w-[110px]">Промокод</th>
              <th className="w-[120px]">Статус</th>
              <th className="w-[190px]">Выдача</th>
              <th className="sticky-actions-head w-[176px] min-w-[176px]">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {payments.map((payment) => {
              const needsRetry = payment.status === 'SUCCEEDED' && !payment.subscriptionProvisionedAt
              return (
                <tr key={payment.id}>
                  <td className="text-slate-500">{new Date(payment.createdAt).toLocaleString('ru-RU')}</td>
                  <td>
                    <div className="max-w-[220px] truncate font-medium">{payment.user.email}</div>
                    <div className="text-xs text-slate-500">{payment.user.name || 'Без имени'}</div>
                  </td>
                  <td>{payment.plan.name}</td>
                  <td>
                    <PaymentAmount
                      amountKopecks={payment.amountKopecks}
                      originalAmountKopecks={payment.originalAmountKopecks}
                      discountKopecks={payment.discountKopecks}
                    />
                  </td>
                  <td className="text-slate-500">{getPromoCodeLabel(payment.promoCodeSnapshot)}</td>
                  <td><PaymentBadge status={payment.status} /></td>
                  <td>
                    <div className="space-y-1">
                      <ProvisioningBadge provisioned={Boolean(payment.subscriptionProvisionedAt)} />
                      {payment.provisioningError && (
                        <div className="max-w-[180px] truncate text-xs text-slate-500">{payment.provisioningError}</div>
                      )}
                    </div>
                  </td>
                  <td className="sticky-actions-cell w-[176px] min-w-[176px]">
                    <div className="action-row">
                      {payment.yookassaId && <PaymentSyncButton paymentId={payment.id} />}
                      {needsRetry ? (
                        <RecoveryActionButton paymentId={payment.id} />
                      ) : payment.subscriptionId ? (
                        <Link href="/dashboard/admin/subscriptions" className="btn-secondary min-w-[112px] px-3 text-xs">
                          Подписка
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 xl:hidden">
        {payments.map((payment) => {
          const needsRetry = payment.status === 'SUCCEEDED' && !payment.subscriptionProvisionedAt
          return (
            <article key={payment.id} className="overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-surface-900">
              <div className="border-b bg-slate-50 px-4 py-3 dark:bg-surface-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-semibold">{payment.user.email}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{formatAdminPaymentDate(payment.createdAt)}</div>
                  </div>
                  <PaymentBadge status={payment.status} />
                </div>
              </div>
              <div className="space-y-3 px-4 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Тариф</div>
                    <div className="mt-1 font-medium">{payment.plan.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Сумма</div>
                    <PaymentAmount
                      amountKopecks={payment.amountKopecks}
                      originalAmountKopecks={payment.originalAmountKopecks}
                      discountKopecks={payment.discountKopecks}
                      align="right"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <AdminInfoCell
                    label="Выдача"
                    value={payment.subscriptionProvisionedAt ? 'Выдана' : payment.status === 'SUCCEEDED' ? 'Нужен retry' : '—'}
                  />
                  <AdminInfoCell label="Промокод" value={getPromoCodeLabel(payment.promoCodeSnapshot)} />
                  <AdminInfoCell label="ID платежа" value={shortId(payment.yookassaId || payment.id)} mono />
                </div>
                {payment.provisioningError && (
                  <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                    {payment.provisioningError}
                  </div>
                )}
                <div className="action-row">
                  {payment.yookassaId && <PaymentSyncButton paymentId={payment.id} />}
                  {needsRetry ? (
                    <RecoveryActionButton paymentId={payment.id} />
                  ) : payment.subscriptionId ? (
                    <Link href="/dashboard/admin/subscriptions" className="btn-secondary min-w-[112px] px-3 text-xs">
                      Открыть подписки
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function AdminInfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
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
    <div className={align === 'right' ? 'mt-1 text-right' : undefined}>
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

function formatAdminPaymentDate(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}
