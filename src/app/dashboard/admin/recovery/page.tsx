import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatPrice } from '@/lib/format'
import { PageHeader } from '@/components/dashboard/page-header'
import { PaymentBadge } from '@/components/admin/admin-badges'
import { RecoveryActionButton } from '@/components/admin/recovery-actions'

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
        <div className="card py-12 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold">Очередь пустая</h2>
          <p className="mt-1 text-sm text-slate-500">Все успешные оплаты уже связаны с подписками.</p>
        </div>
      ) : (
        <div className="table-shell">
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
