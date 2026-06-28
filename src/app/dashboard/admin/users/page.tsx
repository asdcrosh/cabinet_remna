import Link from 'next/link'
import { CalendarDays, CheckCircle2, ChevronDown, Search, Send, XCircle } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { PageHeader } from '@/components/dashboard/page-header'
import { SubscriptionBadge } from '@/components/admin/admin-badges'
import { UserRoleSelect } from '@/components/admin/user-role-select'
import { BonusBoxAttemptsButton } from '@/components/admin/bonus-box-attempts-button'
import { UserProfileEditButton } from '@/components/admin/user-profile-edit-button'
import { LazyListLoader } from '@/components/admin/lazy-list-loader'
import { ADMIN_LIST_PAGE_SIZE, parseAdminListLimit } from '@/lib/admin-list'
import { UserPlanButton } from '@/components/admin/user-plan-button'
import { formatPrice } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Пользователи — Админка' }

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: { q?: string; limit?: string; role?: string; account?: string }
}) {
  const { session, user: actor } = await requireAdminPage()

  const q = searchParams?.q?.trim() ?? ''
  const role = searchParams?.role ?? 'ALL'
  const account = searchParams?.account ?? 'ALL'
  const limit = parseAdminListLimit(searchParams?.limit)
  const where = {
    ...(role !== 'ALL' ? { role: role as any } : {}),
    ...(account === 'LINKED'
      ? { remnawaveUuid: { not: null } }
      : account === 'UNLINKED'
        ? { remnawaveUuid: null }
        : {}),
    ...(q ? {
        OR: [
          { email: { contains: q, mode: 'insensitive' as const } },
          { name: { contains: q, mode: 'insensitive' as const } },
          { remnawaveUsername: { contains: q, mode: 'insensitive' as const } },
        ],
      } : {}),
  }

  const [total, users, plans] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        telegramId: true,
        telegramUsername: true,
        emailVerifiedAt: true,
        remnashopUserId: true,
        remnawaveUuid: true,
        remnawaveShortUuid: true,
        remnawaveUsername: true,
        createdAt: true,
        lastLoginAt: true,
        subscriptions: {
          orderBy: { expireAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            amountKopecks: true,
            createdAt: true,
            plan: { select: { name: true } },
          },
        },
        _count: { select: { payments: true, subscriptions: true, devices: true } },
      },
    }),
    prisma.plan.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
      select: { id: true, name: true, priceKopecks: true, durationDays: true, isActive: true },
    }),
  ])
  const now = new Date()
  const userIds = users.map((user) => user.id)
  const attemptsRows = userIds.length > 0
    ? await prisma.bonusBoxAttempt.groupBy({
        by: ['userId'],
        where: {
          userId: { in: userIds },
          usedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        _count: { _all: true },
      })
    : []
  const attemptsByUser = new Map(attemptsRows.map((row) => [row.userId, row._count._all]))

  return (
    <div className="space-y-6">
      <PageHeader title="Пользователи" description="Аккаунты, роли, профили Remnawave и последние подписки" />

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-surface-900 lg:flex-row lg:items-center lg:justify-between">
        <form className="grid min-w-0 flex-1 gap-2 md:grid-cols-[minmax(14rem,1fr)_11rem_12rem_auto_auto]" action="/dashboard/admin/users">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Email, имя или Remnawave username"
              className="input pl-9"
            />
          </div>
          <select name="role" defaultValue={role} className="input">
            <option value="ALL">Все роли</option>
            <option value="USER">Пользователи</option>
            <option value="MODERATOR">Модераторы</option>
            <option value="ADMIN">Администраторы</option>
            <option value="SUPER_ADMIN">Главные админы</option>
          </select>
          <select name="account" defaultValue={account} className="input">
            <option value="ALL">Любой VPN-профиль</option>
            <option value="LINKED">Профиль создан</option>
            <option value="UNLINKED">Без профиля</option>
          </select>
          <button className="btn-primary" type="submit">Найти</button>
          {(q || role !== 'ALL' || account !== 'ALL') && <Link href="/dashboard/admin/users" className="btn-secondary">Сбросить</Link>}
        </form>
        <div className="text-sm text-slate-500">
          {users.length} из {total}
        </div>
      </div>

      {users.length === 0 && (
        <div className="card py-12 text-center">
          <h2 className="font-semibold">Пользователи не найдены</h2>
          <p className="mt-1 text-sm text-slate-500">Измените фильтры или очистите строку поиска.</p>
        </div>
      )}

      <div className={users.length > 0 ? 'space-y-3' : 'hidden'}>
        {users.map((user) => {
          const subscription = user.subscriptions[0]
          const lastPayment = user.payments[0]
          const attemptsCount = attemptsByUser.get(user.id) ?? 0
          return (
            <article key={user.id} className="overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-surface-900">
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(15rem,1.4fr)_minmax(11rem,.8fr)_minmax(13rem,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${user.lastLoginAt ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <div className="truncate font-semibold">{user.email}</div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{user.name || 'Без имени'}</span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {user.createdAt.toLocaleDateString('ru-RU')}
                    </span>
                    {user.telegramId && (
                      <span className="inline-flex items-center gap-1 text-sky-600">
                        <Send className="h-3.5 w-3.5" />
                        @{user.telegramUsername || user.telegramId.toString()}
                      </span>
                    )}
                  </div>
                </div>

                <UserRoleSelect
                  userId={user.id}
                  role={user.role}
                  actorId={session.uid}
                  actorRole={actor.role}
                />

                <div className="min-w-0">
                  {subscription ? (
                    <div className="flex items-center gap-3">
                      <SubscriptionBadge status={subscription.status} />
                      <div className="min-w-0 text-xs text-slate-500">
                        <div className="truncate font-medium text-slate-700 dark:text-slate-200">{subscription.plan?.name || 'Без тарифа'}</div>
                        <div>до {subscription.expireAt.toLocaleDateString('ru-RU')}</div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400">Подписки нет</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end">
                  <div className="grid grid-cols-3 gap-1 text-center text-xs">
                    <Counter value={user._count.payments} label="оплат" />
                    <Counter value={user._count.devices} label="устр." />
                    <Counter value={attemptsCount} label="подар." />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {actor.role === 'SUPER_ADMIN' && (
                      <BonusBoxAttemptsButton
                        userId={user.id}
                        email={user.email}
                        attemptsCount={attemptsCount}
                      />
                    )}
                    {(actor.role === 'SUPER_ADMIN' || user.role !== 'SUPER_ADMIN') && (
                      <UserPlanButton
                        userId={user.id}
                        email={user.email}
                        currentPlanId={subscription?.planId ?? null}
                        plans={plans}
                      />
                    )}
                    {(actor.role === 'SUPER_ADMIN' || user.role !== 'SUPER_ADMIN') && (
                      <UserProfileEditButton
                        userId={user.id}
                        email={user.email}
                        name={user.name}
                        emailVerified={Boolean(user.emailVerifiedAt)}
                      />
                    )}
                  </div>
                </div>
              </div>

              <details className="group border-t">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                  Подробный профиль
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-3 border-t bg-slate-50/60 p-4 sm:grid-cols-2 xl:grid-cols-4 dark:bg-white/[0.02]">
                  <InfoCell label="Email подтверждён" value={user.emailVerifiedAt ? user.emailVerifiedAt.toLocaleDateString('ru-RU') : 'Нет'} ok={Boolean(user.emailVerifiedAt)} />
                  <InfoCell label="Telegram" value={user.telegramId ? `${user.telegramId}` : 'Не привязан'} ok={Boolean(user.telegramId)} mono />
                  <InfoCell label="Remnawave" value={user.remnawaveUsername || 'Не создан'} ok={Boolean(user.remnawaveUuid)} mono />
                  <InfoCell label="Remnashop ID" value={user.remnashopUserId ?? 'Не связан'} ok={Boolean(user.remnashopUserId)} />
                  <InfoCell label="UUID Remnawave" value={user.remnawaveUuid || '—'} mono />
                  <InfoCell label="Short UUID" value={user.remnawaveShortUuid || '—'} mono />
                  <InfoCell label="Последний вход" value={user.lastLoginAt ? user.lastLoginAt.toLocaleString('ru-RU') : 'Не входил'} />
                  <InfoCell label="Подписок всего" value={user._count.subscriptions} />
                  <InfoCell
                    label="Последняя оплата"
                    value={lastPayment ? `${paymentStatusLabel(lastPayment.status)} · ${formatPrice(lastPayment.amountKopecks)}` : 'Нет оплат'}
                    ok={lastPayment?.status === 'SUCCEEDED'}
                  />
                  <InfoCell
                    label="Тариф оплаты"
                    value={lastPayment ? `${lastPayment.plan.name} · ${lastPayment.createdAt.toLocaleDateString('ru-RU')}` : '—'}
                  />
                </div>
              </details>
            </article>
          )
        })}
      </div>

      <LazyListLoader loaded={users.length} total={total} step={ADMIN_LIST_PAGE_SIZE} />
    </div>
  )
}

function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: 'Ожидает',
    SUCCEEDED: 'Оплачен',
    CANCELED: 'Отменён',
    REFUNDED: 'Возврат',
  }
  return labels[status] ?? status
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-12 rounded-md bg-slate-50 px-2 py-1.5 dark:bg-white/5">
      <div className="font-semibold text-slate-800 dark:text-slate-100">{value}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
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
