import Link from 'next/link'
import { CheckCircle2, Search, XCircle } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { PageHeader } from '@/components/dashboard/page-header'
import { SubscriptionBadge } from '@/components/admin/admin-badges'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Пользователи — Админка' }

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: { q?: string; page?: string }
}) {
  await requireAdminPage()

  const q = searchParams?.q?.trim() ?? ''
  const page = Math.max(1, Number(searchParams?.page || '1') || 1)
  const pageSize = 25
  const skip = (page - 1) * pageSize
  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: 'insensitive' as const } },
          { name: { contains: q, mode: 'insensitive' as const } },
          { remnawaveUsername: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : undefined

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        remnawaveUuid: true,
        remnawaveUsername: true,
        createdAt: true,
        lastLoginAt: true,
        subscriptions: {
          orderBy: { expireAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
        _count: { select: { payments: true, subscriptions: true, devices: true } },
      },
    }),
  ])
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-6">
      <PageHeader title="Пользователи" description="Аккаунты, роли, профили Remnawave и последние подписки" />

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-surface-900 lg:flex-row lg:items-center lg:justify-between">
        <form className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]" action="/dashboard/admin/users">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Email, имя или Remnawave username"
              className="input pl-9"
            />
          </div>
          <button className="btn-primary" type="submit">Найти</button>
          {q && <Link href="/dashboard/admin/users" className="btn-secondary">Сбросить</Link>}
        </form>
        <div className="text-sm text-slate-500">
          {total} всего, страница {page} из {pageCount}
        </div>
      </div>

      <div className="table-shell hidden xl:block">
        <table className="data-table min-w-[960px]">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-surface-800">
            <tr>
              <th className="w-[280px]">Пользователь</th>
              <th className="w-[100px]">Роль</th>
              <th className="w-[220px]">Remnawave</th>
              <th className="w-[220px]">Последняя подписка</th>
              <th className="w-[140px]">Активность</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map((user) => {
              const subscription = user.subscriptions[0]
              return (
                <tr key={user.id}>
                  <td>
                    <div className="max-w-[250px] truncate font-medium">{user.email}</div>
                    <div className="text-xs text-slate-500">{user.name || 'Без имени'}</div>
                  </td>
                  <td>
                    <span className={user.role === 'ADMIN' ? 'badge-active' : 'badge-limited'}>{user.role}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      {user.remnawaveUuid ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-slate-400" />
                      )}
                      <span className="max-w-[170px] truncate font-mono text-xs">{user.remnawaveUsername || 'не создан'}</span>
                    </div>
                  </td>
                  <td>
                    {subscription ? (
                      <div className="space-y-1">
                        <SubscriptionBadge status={subscription.status} />
                        <div className="text-xs text-slate-500">
                          {subscription.plan?.name || 'Без тарифа'} до {subscription.expireAt.toLocaleDateString('ru-RU')}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">Нет</span>
                    )}
                  </td>
                  <td className="text-xs text-slate-500">
                    <div>Платежи: {user._count.payments}</div>
                    <div>Подписки: {user._count.subscriptions}</div>
                    <div>Устройства: {user._count.devices}</div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 xl:hidden">
        {users.map((user) => {
          const subscription = user.subscriptions[0]
          return (
            <article key={user.id} className="card space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words font-semibold">{user.email}</div>
                  <div className="text-sm text-slate-500">{user.name || 'Без имени'}</div>
                </div>
                <span className={user.role === 'ADMIN' ? 'badge-active' : 'badge-limited'}>{user.role}</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <InfoCell
                  label="Remnawave"
                  value={user.remnawaveUsername || 'не создан'}
                  ok={Boolean(user.remnawaveUuid)}
                  mono
                />
                <InfoCell
                  label="Последняя подписка"
                  value={subscription ? `${subscription.plan?.name || 'Без тарифа'} до ${subscription.expireAt.toLocaleDateString('ru-RU')}` : 'Нет'}
                />
                <InfoCell label="Платежи" value={user._count.payments} />
                <InfoCell label="Устройства" value={user._count.devices} />
              </div>
            </article>
          )
        })}
      </div>

      <Pagination page={page} pageCount={pageCount} q={q} />
    </div>
  )
}

function Pagination({ page, pageCount, q }: { page: number; pageCount: number; q: string }) {
  const makeHref = (nextPage: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (nextPage > 1) params.set('page', String(nextPage))
    const qs = params.toString()
    return qs ? `/dashboard/admin/users?${qs}` : '/dashboard/admin/users'
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <Link
        href={makeHref(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={page <= 1 ? 'btn-secondary pointer-events-none opacity-50' : 'btn-secondary'}
      >
        Назад
      </Link>
      <span className="text-sm text-slate-500">
        {page} / {pageCount}
      </span>
      <Link
        href={makeHref(Math.min(pageCount, page + 1))}
        aria-disabled={page >= pageCount}
        className={page >= pageCount ? 'btn-secondary pointer-events-none opacity-50' : 'btn-secondary'}
      >
        Вперёд
      </Link>
    </div>
  )
}

function InfoCell({
  label,
  value,
  ok,
  mono,
}: {
  label: string
  value: string | number
  ok?: boolean
  mono?: boolean
}) {
  return (
    <div className="info-cell">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={mono ? 'mt-1 flex min-w-0 items-center gap-2 font-mono text-xs' : 'mt-1 font-medium'}>
        {ok !== undefined && (ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <XCircle className="h-4 w-4 shrink-0 text-slate-400" />)}
        <span className="truncate">{value}</span>
      </div>
    </div>
  )
}
