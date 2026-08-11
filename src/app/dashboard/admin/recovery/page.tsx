import { AlertCircle, CheckCircle2, Clock3 } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatPrice } from '@/lib/format'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { BulkRecoveryActionButton, RecoveryActionButton } from '@/components/admin/recovery-actions'
import { SubscriptionHealthActions, SubscriptionHealthBatchButton } from '@/components/admin/subscription-health-actions'
import { AdminEmptyState } from '@/components/admin/admin-empty-state'
import { LazyListLoader } from '@/components/admin/lazy-list-loader'
import { ADMIN_LIST_PAGE_SIZE, parseAdminListLimit } from '@/lib/admin-list'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Контроль подписок — Админка' }
const RECOVERY_LIST_MAX_SIZE = 100

export default async function AdminRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>
}) {
  await requireAdminPage()
  const params = await searchParams
  const limit = parseAdminListLimit(
    params.limit,
    ADMIN_LIST_PAGE_SIZE,
    RECOVERY_LIST_MAX_SIZE
  )
  const where = { status: 'SUCCEEDED' as const, subscriptionProvisionedAt: null }

  const [total, payments, healthItems, warningCount, errorCount] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { email: true, name: true, remnawaveId: true, remnawaveUuid: true, remnawaveUsername: true } },
        plan: true,
        provisioningJob: true,
      },
    }),
    prisma.subscriptionHealth.findMany({
      where: { status: { not: 'HEALTHY' } },
      orderBy: [{ status: 'desc' }, { checkedAt: 'desc' }],
      take: 100,
      include: {
        user: { select: { email: true, name: true } },
        events: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    }),
    prisma.subscriptionHealth.count({ where: { status: 'WARNING' } }),
    prisma.subscriptionHealth.count({ where: { status: 'ERROR' } }),
  ])

  return (
    <AdminPageShell
      title="Контроль подписок"
      description="Сверка Cabinet, Remnawave и Remnashop без скрытого продления доступа"
      action={<SubscriptionHealthBatchButton />}
    >
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3 dark:border-white/10">
          <div>
            <h2 className="text-lg font-semibold">Расхождения</h2>
            <p className="mt-1 text-sm text-slate-500">Ошибок: {errorCount}. Предупреждений: {warningCount}.</p>
          </div>
          <div className="text-xs text-slate-500">Автопроверка не продлевает и не включает подписки</div>
        </div>

        {healthItems.length === 0 ? (
          <AdminEmptyState
            title="Расхождений не найдено"
            description="Запустите проверку, чтобы получить актуальное состояние всех подписок."
            icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />}
          />
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white divide-y divide-slate-200 dark:border-white/10 dark:bg-white/[0.025] dark:divide-white/[0.07]">
            {healthItems.map((item) => {
              const issues = readIssues(item.issues)
              return (
                <article key={item.id} className={`grid gap-4 border-l-4 px-4 py-4 lg:grid-cols-[minmax(13rem,.8fr)_minmax(20rem,1.5fr)_auto] lg:items-start ${item.status === 'ERROR' ? 'border-l-red-500' : 'border-l-amber-400'}`}>
                  <div className="min-w-0">
                    <div className="break-words text-sm font-semibold">{item.user.name || item.user.email}</div>
                    {item.user.name ? <div className="mt-1 break-all text-xs text-slate-500">{item.user.email}</div> : null}
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      {item.checkedAt.toLocaleString('ru-RU')}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {issues.map((issue) => (
                      <div key={`${item.id}-${issue.code}`} className="flex gap-2">
                        <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${issue.severity === 'ERROR' ? 'text-red-500' : 'text-amber-500'}`} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{issue.title}</div>
                          <div className="mt-0.5 text-xs leading-5 text-slate-500">{issue.detail}</div>
                        </div>
                      </div>
                    ))}
                    {item.lastError ? <div className="text-xs text-red-600 dark:text-red-300">Последняя попытка: {item.lastError}</div> : null}
                    {item.events.length > 0 ? (
                      <details className="pt-1 text-xs text-slate-500">
                        <summary className="cursor-pointer font-medium">История проверок</summary>
                        <div className="mt-2 space-y-2 border-l border-slate-200 pl-3 dark:border-white/10">
                          {item.events.map((event) => {
                            const changes = readStringArray(event.changes)
                            return (
                              <div key={event.id}>
                                <div>{event.createdAt.toLocaleString('ru-RU')} · {eventActionLabel(event.action)} · {event.status}</div>
                                {changes.length > 0 ? <div className="mt-0.5">{changes.join('. ')}</div> : null}
                                {event.error ? <div className="mt-0.5 text-red-600 dark:text-red-300">{event.error}</div> : null}
                              </div>
                            )
                          })}
                        </div>
                      </details>
                    ) : null}
                  </div>
                  <SubscriptionHealthActions userId={item.userId} />
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="mt-8 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3 dark:border-white/10">
          <div>
            <h2 className="text-lg font-semibold">Оплачено, но не выдано</h2>
            <p className="mt-1 text-sm text-slate-500">Платежей в очереди: {total}</p>
          </div>
          {payments.length > 0 ? <BulkRecoveryActionButton paymentIds={payments.map((payment) => payment.id)} /> : null}
        </div>
      {payments.length === 0 ? (
        <AdminEmptyState
          title="Очередь пустая"
          description="Все успешные оплаты уже связаны с подписками."
          icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />}
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white divide-y divide-slate-200 dark:border-white/10 dark:bg-white/[0.025] dark:divide-white/[0.07]">
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
      <LazyListLoader
        loaded={payments.length}
        total={total}
        step={ADMIN_LIST_PAGE_SIZE}
        max={RECOVERY_LIST_MAX_SIZE}
      />
      </section>
    </AdminPageShell>
  )
}

type HealthIssue = {
  code: string
  severity: 'WARNING' | 'ERROR'
  title: string
  detail: string
}

function readIssues(value: unknown): HealthIssue[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is HealthIssue => (
    typeof item === 'object' && item !== null &&
    'code' in item && typeof item.code === 'string' &&
    'severity' in item && (item.severity === 'WARNING' || item.severity === 'ERROR') &&
    'title' in item && typeof item.title === 'string' &&
    'detail' in item && typeof item.detail === 'string'
  ))
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function eventActionLabel(action: string) {
  if (action === 'MANUAL_REPAIR') return 'ручное исправление'
  if (action === 'AUTO_REPAIR') return 'автопроверка'
  return 'проверка'
}
