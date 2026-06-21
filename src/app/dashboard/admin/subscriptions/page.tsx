import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatBytes } from '@/lib/format'
import { PageHeader } from '@/components/dashboard/page-header'
import { SubscriptionBadge } from '@/components/admin/admin-badges'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Подписки — Админка' }

export default async function AdminSubscriptionsPage() {
  await requireAdminPage()

  const subscriptions = await prisma.subscription.findMany({
    orderBy: { expireAt: 'desc' },
    take: 100,
    include: {
      plan: true,
      user: { select: { email: true, name: true, remnawaveUuid: true, remnawaveUsername: true } },
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Подписки" description="Локальные подписки и их состояние синхронизации" />

      <div className="table-shell hidden xl:block">
        <table className="data-table min-w-[980px]">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-surface-800">
            <tr>
              <th className="w-[270px]">Пользователь</th>
              <th className="w-[140px]">Тариф</th>
              <th className="w-[120px]">Статус</th>
              <th className="w-[180px]">Срок</th>
              <th className="w-[180px]">Трафик</th>
              <th className="w-[120px]">Sync</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {subscriptions.map((subscription) => (
              <tr key={subscription.id}>
                <td>
                  <div className="max-w-[240px] truncate font-medium">{subscription.user.email}</div>
                  <div className="max-w-[240px] truncate font-mono text-xs text-slate-500">{subscription.user.remnawaveUsername || 'нет профиля'}</div>
                </td>
                <td>{subscription.plan?.name || 'Без тарифа'}</td>
                <td><SubscriptionBadge status={subscription.status} /></td>
                <td>
                  <div>{subscription.expireAt.toLocaleDateString('ru-RU')}</div>
                  <div className="text-xs text-slate-500">с {subscription.startAt.toLocaleDateString('ru-RU')}</div>
                </td>
                <td>
                  <div>{formatBytes(subscription.trafficUsedBytes)}</div>
                  <div className="text-xs text-slate-500">
                    из {subscription.trafficLimitBytes ? formatBytes(subscription.trafficLimitBytes) : 'безлимита'}
                  </div>
                </td>
                <td>
                  <span className={subscription.pendingSync ? 'badge-limited' : 'badge-active'}>
                    {subscription.pendingSync ? 'нужен sync' : 'ок'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 xl:hidden">
        {subscriptions.map((subscription) => (
          <article key={subscription.id} className="card space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="break-words font-semibold">{subscription.user.email}</div>
                <div className="truncate font-mono text-xs text-slate-500">
                  {subscription.user.remnawaveUsername || 'нет профиля'}
                </div>
              </div>
              <SubscriptionBadge status={subscription.status} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCell label="Тариф" value={subscription.plan?.name || 'Без тарифа'} />
              <InfoCell
                label="Срок"
                value={`${subscription.startAt.toLocaleDateString('ru-RU')} — ${subscription.expireAt.toLocaleDateString('ru-RU')}`}
              />
              <InfoCell
                label="Трафик"
                value={`${formatBytes(subscription.trafficUsedBytes)} из ${
                  subscription.trafficLimitBytes ? formatBytes(subscription.trafficLimitBytes) : 'безлимита'
                }`}
              />
              <InfoCell label="Sync" value={subscription.pendingSync ? 'нужен sync' : 'ок'} />
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-cell">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-words font-medium">{value}</div>
    </div>
  )
}
