import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatPrice } from '@/lib/format'
import { PageHeader } from '@/components/dashboard/page-header'
import { PaymentBadge } from '@/components/admin/admin-badges'
import { RecoveryActionButton } from '@/components/admin/recovery-actions'
import { AdminEmptyState } from '@/components/admin/admin-empty-state'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Recovery — Админка' }

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
    <div className="space-y-6">
      <PageHeader
        title="Recovery"
        description="Оплаты, которые прошли, но подписка ещё не была выдана"
      />

      {payments.length === 0 ? (
        <AdminEmptyState
          title="Очередь пустая"
          description="Все успешные оплаты уже связаны с подписками."
          icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />}
        />
      ) : (
        <>
          <div className="table-shell hidden xl:block">
            <table className="data-table min-w-[900px]">
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
                      <div className="mb-1"><PaymentBadge status={payment.status} /></div>
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

          <div className="space-y-3 xl:hidden">
            {payments.map((payment) => (
              <article key={payment.id} className="overflow-hidden rounded-lg border bg-white shadow-sm dark:border-white/10 dark:bg-surface-900">
                <div className="border-b bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="break-words text-sm font-semibold">{payment.user.email}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{new Date(payment.createdAt).toLocaleString('ru-RU')}</div>
                    </div>
                    <PaymentBadge status={payment.status} />
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <InfoCell label="Тариф" value={payment.plan.name} />
                    <InfoCell label="Сумма" value={formatPrice(payment.amountKopecks)} />
                    <InfoCell
                      label="Job"
                      value={payment.provisioningJob ? `${payment.provisioningJob.status}, попыток: ${payment.provisioningJob.attempts}` : 'Не создавался'}
                    />
                    <InfoCell
                      label="Retry"
                      value={payment.provisioningJob?.nextRetryAt ? payment.provisioningJob.nextRetryAt.toLocaleString('ru-RU') : '—'}
                    />
                  </div>
                  <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                    {payment.provisioningJob?.lastError || payment.provisioningError || 'Подписка не была выдана.'}
                  </div>
                  <div className="action-row">
                    <RecoveryActionButton paymentId={payment.id} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {payments.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>После довыдачи пользователь получит или обновит Remnawave-профиль, а платёж будет связан с подпиской.</div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  )
}
