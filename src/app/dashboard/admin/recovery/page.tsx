import { CheckCircle2 } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatPrice } from '@/lib/format'
import { PageHeader } from '@/components/dashboard/page-header'
import { BulkRecoveryActionButton, RecoveryActionButton } from '@/components/admin/recovery-actions'
import { AdminEmptyState } from '@/components/admin/admin-empty-state'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Довыдача — Админка' }

export default async function AdminRecoveryPage() {
  await requireAdminPage()

  const payments = await prisma.payment.findMany({
    where: { status: 'SUCCEEDED', subscriptionProvisionedAt: null },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { email: true, name: true, remnawaveUuid: true, remnawaveUsername: true } },
      plan: true,
      provisioningJob: true,
    },
  })

  return (
    <div className="page-stack">
      <PageHeader
        title="Довыдача"
        description="Оплаты, которые прошли, но подписка ещё не была выдана"
        action={payments.length > 0 ? <BulkRecoveryActionButton paymentIds={payments.map((payment) => payment.id)} /> : null}
      />

      {payments.length === 0 ? (
        <AdminEmptyState
          title="Очередь пустая"
          description="Все успешные оплаты уже связаны с подписками."
          icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />}
        />
      ) : (
        <>
          <div className="table-shell hidden 2xl:block">
            <table className="data-table min-w-[900px]">
              <caption className="sr-only">Платежи, для которых требуется повторная выдача подписки</caption>
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-surface-800">
                <tr>
                  <th className="w-[260px]">Пользователь</th>
                  <th className="w-[140px]">Тариф</th>
                  <th className="w-[120px]">Сумма</th>
                  <th className="w-[260px]">Ошибка</th>
                  <th className="sticky-actions-head w-[150px] min-w-[150px]">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <div className="max-w-[230px] truncate font-medium">{payment.user.email}</div>
                      <div className="text-xs text-slate-500">{new Date(payment.createdAt).toLocaleString('ru-RU')}</div>
                    </td>
                    <td>{payment.plan.name}</td>
                    <td className="font-medium">{formatPrice(payment.amountKopecks)}</td>
                    <td className="max-w-xs">
                      <div className="line-clamp-2 text-xs text-slate-500">
                        {payment.provisioningJob
                          ? `${payment.provisioningJob.status}, попыток: ${payment.provisioningJob.attempts}`
                          : 'Job ещё не создавался'}
                      </div>
                      <div className="line-clamp-2 text-xs text-slate-500">
                        {payment.provisioningJob?.lastError || payment.provisioningError || 'Подписка не была выдана.'}
                      </div>
                      {payment.provisioningJob?.nextRetryAt && (
                        <div className="text-xs text-slate-400">
                          Следующая попытка: {payment.provisioningJob.nextRetryAt.toLocaleString('ru-RU')}
                        </div>
                      )}
                    </td>
                    <td className="sticky-actions-cell w-[150px] min-w-[150px]">
                      <div className="action-row">
                        <RecoveryActionButton paymentId={payment.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 2xl:hidden">
            {payments.map((payment) => (
              <article key={payment.id} className="overflow-hidden rounded-2xl border bg-white dark:border-white/10 dark:bg-white/[0.035]">
                <div className="px-4 pb-2 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="break-words text-sm font-semibold">{payment.user.email}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{new Date(payment.createdAt).toLocaleString('ru-RU')}</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 px-4 pb-4">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{payment.plan.name}</span>
                    <span className="shrink-0 font-semibold">{formatPrice(payment.amountKopecks)}</span>
                  </div>
                  <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                    {payment.provisioningJob?.lastError || payment.provisioningError || 'Подписка не была выдана.'}
                  </div>
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer font-medium">Технические детали</summary>
                    <div className="mt-2 space-y-1 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
                      <div>Job: {payment.provisioningJob ? `${payment.provisioningJob.status}, попыток: ${payment.provisioningJob.attempts}` : 'не создавался'}</div>
                      <div>Retry: {payment.provisioningJob?.nextRetryAt ? payment.provisioningJob.nextRetryAt.toLocaleString('ru-RU') : 'не запланирован'}</div>
                    </div>
                  </details>
                  <div className="grid gap-2 sm:flex sm:justify-end">
                    <RecoveryActionButton paymentId={payment.id} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
