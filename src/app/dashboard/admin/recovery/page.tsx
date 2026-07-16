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
        description="Оплаченные, но не выданные подписки"
        action={payments.length > 0 ? <BulkRecoveryActionButton paymentIds={payments.map((payment) => payment.id)} /> : null}
      />

      {payments.length === 0 ? (
        <AdminEmptyState
          title="Очередь пустая"
          description="Все успешные оплаты уже связаны с подписками."
          icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-200 dark:border-white/10 dark:bg-white/[0.025] dark:divide-white/[0.07]">
          {payments.map((payment) => (
            <article key={payment.id} className="grid gap-4 border-l-4 border-l-amber-400 px-4 py-4 lg:grid-cols-[minmax(15rem,1.2fr)_minmax(9rem,.65fr)_minmax(16rem,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="break-words text-sm font-semibold">{payment.user.email}</div>
                <div className="mt-1 text-xs text-slate-500">{new Date(payment.createdAt).toLocaleString('ru-RU')}</div>
              </div>
              <div className="flex items-baseline justify-between gap-3 lg:block">
                <span className="truncate text-sm font-medium">{payment.plan.name}</span>
                <span className="shrink-0 font-semibold lg:mt-1 lg:block">{formatPrice(payment.amountKopecks)}</span>
              </div>
              <div className="min-w-0">
                <div className="text-sm text-amber-800 dark:text-amber-100">
                  {payment.provisioningJob?.lastError || payment.provisioningError || 'Подписка не была выдана.'}
                </div>
                <details className="mt-2 text-xs text-slate-500">
                  <summary className="cursor-pointer font-medium">Технические детали</summary>
                  <div className="mt-2 space-y-1 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
                    <div>Задача: {payment.provisioningJob ? `${payment.provisioningJob.status}, попыток: ${payment.provisioningJob.attempts}` : 'не создавалась'}</div>
                    <div>Повтор: {payment.provisioningJob?.nextRetryAt ? payment.provisioningJob.nextRetryAt.toLocaleString('ru-RU') : 'не запланирован'}</div>
                  </div>
                </details>
              </div>
              <div className="grid lg:justify-end">
                <RecoveryActionButton paymentId={payment.id} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
