import type { ReactNode } from 'react'
import { CalendarDays, CheckCircle2, ChevronDown, Download, Search, Send, XCircle } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { SubscriptionBadge } from '@/components/admin/admin-badges'
import { UserRoleSelect } from '@/components/admin/user-role-select'
import { BonusBoxAttemptsButton } from '@/components/admin/bonus-box-attempts-button'
import { UserProfileEditButton } from '@/components/admin/user-profile-edit-button'
import { LazyListLoader } from '@/components/admin/lazy-list-loader'
import { ADMIN_LIST_PAGE_SIZE, parseAdminListLimit } from '@/lib/admin-list'
import { UserPlanButton } from '@/components/admin/user-plan-button'
import { UserDetailsButton, type AdminUserDetails } from '@/components/admin/user-details-button'
import { UserSyncButton } from '@/components/admin/user-sync-button'
import { formatPrice } from '@/lib/format'
import { AdminFilterSubmitButton } from '@/components/admin/admin-filter-submit-button'
import { AdminFilterBar, AdminFilterField } from '@/components/admin/admin-filter-bar'
import { AdminEmptyState } from '@/components/admin/admin-empty-state'
import { AdminActionsMenu } from '@/components/admin/admin-actions-menu'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Пользователи — Админка' }

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; limit?: string; role?: string; account?: string }>
}) {
  const { session, user: actor } = await requireAdminPage()

  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const role = params.role ?? 'ALL'
  const account = params.account ?? 'ALL'
  const limit = parseAdminListLimit(params.limit)
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
          take: 5,
          include: { plan: true },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            amountKopecks: true,
            paidAt: true,
            createdAt: true,
            plan: { select: { name: true } },
          },
        },
        devices: {
          orderBy: { lastSeenAt: 'desc' },
          take: 5,
          select: {
            hwid: true,
            platform: true,
            ip: true,
            lastSeenAt: true,
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
    <AdminPageShell
      title="Пользователи"
      description="Аккаунты, роли и подписки"
      action={
        <a href={buildUsersExportHref(q, role, account)} className="btn-secondary w-full sm:w-auto">
          <Download className="h-4 w-4" />
          Экспорт CSV
        </a>
      }
    >
      <AdminFilterBar
        action="/dashboard/admin/users"
        resetHref="/dashboard/admin/users"
        resetVisible={Boolean(q || role !== 'ALL' || account !== 'ALL')}
        count={{ shown: users.length, total }}
        className="md:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_11rem_13rem_auto_auto]"
      >
        <input type="hidden" name="limit" value={ADMIN_LIST_PAGE_SIZE} />
        <AdminFilterField label="Поиск пользователей">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Email, имя или Remnawave username"
              className="input pl-9"
            />
          </div>
        </AdminFilterField>
        <AdminFilterField label="Роль">
          <select name="role" defaultValue={role} className="input">
            <option value="ALL">Все роли</option>
            <option value="USER">Пользователи</option>
            <option value="MODERATOR">Модераторы</option>
            <option value="ADMIN">Администраторы</option>
            <option value="SUPER_ADMIN">Главные админы</option>
          </select>
        </AdminFilterField>
        <AdminFilterField label="VPN-профиль">
          <select name="account" defaultValue={account} className="input">
            <option value="ALL">Любой VPN-профиль</option>
            <option value="LINKED">Профиль создан</option>
            <option value="UNLINKED">Без профиля</option>
          </select>
        </AdminFilterField>
        <AdminFilterSubmitButton idleText="Найти" />
      </AdminFilterBar>

      {users.length === 0 && (
        <AdminEmptyState title="Пользователи не найдены" description="Измените фильтры или очистите строку поиска." />
      )}

      <div className={users.length > 0 ? 'admin-list' : 'hidden'}>
        <div className="admin-list-header grid-cols-[minmax(17rem,1.4fr)_10rem_minmax(14rem,1fr)_12rem_2.5rem] items-center gap-x-5">
          <span>Аккаунт</span>
          <span>Роль</span>
          <span>Подписка</span>
          <span className="text-right">Активность</span>
          <span className="sr-only">Действия</span>
        </div>
        {users.map((user) => {
          const subscription = user.subscriptions[0]
          const lastPayment = user.payments[0]
          const attemptsCount = attemptsByUser.get(user.id) ?? 0
          return (
            <article key={user.id} className="admin-list-row">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-4 py-4 lg:grid-cols-[minmax(17rem,1.4fr)_10rem_minmax(14rem,1fr)_12rem_auto] lg:items-center lg:gap-x-5 lg:gap-y-0">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${user.lastLoginAt ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                      title={user.lastLoginAt ? 'Пользователь входил в кабинет' : 'Входов не было'}
                    />
                    <div className="min-w-0 break-words text-sm font-semibold sm:text-base">{user.email}</div>
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
                    <span className={user.remnawaveUuid ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-400'}>
                      {user.remnawaveUuid ? 'VPN-профиль готов' : 'Без VPN-профиля'}
                    </span>
                  </div>
                </div>

                <div className="col-span-2 grid min-w-0 gap-2 min-[480px]:grid-cols-2 lg:contents">
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/[0.07] dark:bg-white/[0.025] lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:dark:bg-transparent">
                    <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 lg:hidden">Роль</div>
                    <span className={`inline-flex min-h-7 max-w-full items-center rounded-full px-2.5 text-xs font-medium ${roleBadgeClass(user.role)}`}>
                      {roleLabel(user.role)}
                    </span>
                  </div>

                  <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/[0.07] dark:bg-white/[0.025] lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:dark:bg-transparent">
                    <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 lg:hidden">Подписка</div>
                    {subscription ? (
                      <div className="flex items-center gap-2">
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

                  <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-50 p-1.5 text-xs text-slate-500 dark:bg-white/[0.025] min-[480px]:col-span-2 lg:col-auto lg:flex lg:flex-wrap lg:justify-end lg:gap-3 lg:bg-transparent lg:p-0 lg:dark:bg-transparent">
                    <Counter value={user._count.payments} label="оплат" />
                    <Counter value={user._count.devices} label="устр." />
                    <Counter value={attemptsCount} label="подар." />
                  </div>
                </div>

                <div className="col-start-2 row-start-1 lg:col-auto lg:row-auto">
                  <AdminActionsMenu compact label={`Действия: ${user.email}`}>
                    <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/[0.04]">
                      <div className="mb-2 text-xs font-medium text-slate-500">Роль пользователя</div>
                      <UserRoleSelect
                        userId={user.id}
                        role={user.role}
                        actorId={session.uid}
                        actorRole={actor.role}
                      />
                    </div>
                    <UserActions
                      user={user}
                      subscriptionPlanId={subscription?.planId ?? null}
                      attemptsCount={attemptsCount}
                      actorRole={actor.role}
                      plans={plans}
                      showLabels
                    />
                  </AdminActionsMenu>
                </div>
              </div>

              <details className="group border-t border-slate-100 dark:border-white/10">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                  <span>Данные и история аккаунта</span>
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-slate-100 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/[0.02] sm:p-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <DetailPanel title="Связи">
                      <DetailRow label="Email" value={user.emailVerifiedAt ? user.emailVerifiedAt.toLocaleDateString('ru-RU') : 'Не подтверждён'} ok={Boolean(user.emailVerifiedAt)} />
                      <DetailRow label="Telegram" value={user.telegramId ? `${user.telegramId}` : 'Не привязан'} ok={Boolean(user.telegramId)} mono />
                      <DetailRow label="Remnashop" value={user.remnashopUserId ?? 'Не связан'} ok={Boolean(user.remnashopUserId)} mono />
                    </DetailPanel>

                    <DetailPanel title="VPN профиль">
                      <DetailRow label="Username" value={user.remnawaveUsername || 'Не создан'} ok={Boolean(user.remnawaveUuid)} mono />
                      <DetailRow label="UUID" value={user.remnawaveUuid || '—'} mono />
                      <DetailRow label="Short UUID" value={user.remnawaveShortUuid || '—'} mono />
                    </DetailPanel>

                    <DetailPanel title="Активность">
                      <DetailRow label="Последний вход" value={user.lastLoginAt ? user.lastLoginAt.toLocaleString('ru-RU') : 'Не входил'} />
                      <DetailRow label="Подписок" value={user._count.subscriptions} />
                      <DetailRow
                        label="Последняя оплата"
                        value={lastPayment ? `${paymentStatusLabel(lastPayment.status)} · ${formatPrice(lastPayment.amountKopecks)}` : 'Нет оплат'}
                        ok={lastPayment?.status === 'SUCCEEDED'}
                      />
                      <DetailRow
                        label="Тариф оплаты"
                        value={lastPayment ? `${lastPayment.plan.name} · ${lastPayment.createdAt.toLocaleDateString('ru-RU')}` : '—'}
                      />
                    </DetailPanel>
                  </div>
                </div>
              </details>
            </article>
          )
        })}
      </div>

      <LazyListLoader loaded={users.length} total={total} step={ADMIN_LIST_PAGE_SIZE} />
    </AdminPageShell>
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

function buildUsersExportHref(q: string, role: string, account: string) {
  const params = new URLSearchParams({ format: 'csv' })
  if (q) params.set('q', q)
  if (role !== 'ALL') params.set('role', role)
  if (account !== 'ALL') params.set('account', account)
  return `/api/admin/users?${params.toString()}`
}

function subscriptionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ACTIVE: 'Активна',
    EXPIRED: 'Истекла',
    DISABLED: 'Отключена',
    LIMITED: 'Лимит',
  }
  return labels[status] ?? status
}

function buildUserDetails(user: {
  email: string
  name: string | null
  role: string
  createdAt: Date
  lastLoginAt: Date | null
  emailVerifiedAt: Date | null
  telegramId: bigint | null
  telegramUsername: string | null
  remnashopUserId: number | null
  remnawaveUuid: string | null
  remnawaveShortUuid: string | null
  remnawaveUsername: string | null
  subscriptions: Array<{
    id: string
    startAt: Date
    expireAt: Date
    status: string
    trafficLimitBytes: bigint | null
    trafficUsedBytes: bigint
    lastSyncedAt: Date
    plan: { name: string } | null
  }>
  payments: Array<{
    id: string
    status: string
    amountKopecks: number
    paidAt: Date | null
    createdAt: Date
    plan: { name: string }
  }>
  devices: Array<{
    hwid: string
    platform: string | null
    ip: string | null
    lastSeenAt: Date
  }>
}): AdminUserDetails {
  return {
    email: user.email,
    name: user.name || 'Без имени',
    role: roleLabel(user.role),
    createdAt: formatDateTime(user.createdAt),
    lastLoginAt: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Не входил',
    emailVerifiedAt: user.emailVerifiedAt ? formatDateTime(user.emailVerifiedAt) : 'Не подтверждён',
    telegram: user.telegramId
      ? `@${user.telegramUsername || user.telegramId.toString()} · ${user.telegramId.toString()}`
      : 'Не привязан',
    remnashop: user.remnashopUserId ? String(user.remnashopUserId) : 'Не связан',
    remnawaveUsername: user.remnawaveUsername || 'Не создан',
    remnawaveUuid: user.remnawaveUuid || '—',
    remnawaveShortUuid: user.remnawaveShortUuid || '—',
    subscriptions: user.subscriptions.map((subscription) => ({
      id: subscription.id,
      plan: subscription.plan?.name || 'Без тарифа',
      status: subscriptionStatusLabel(subscription.status),
      startAt: formatDate(subscription.startAt),
      expireAt: formatDate(subscription.expireAt),
      traffic: formatTraffic(subscription.trafficUsedBytes, subscription.trafficLimitBytes),
      syncedAt: formatDateTime(subscription.lastSyncedAt),
    })),
    payments: user.payments.map((payment) => ({
      id: payment.id,
      plan: payment.plan.name,
      status: paymentStatusLabel(payment.status),
      amount: formatPrice(payment.amountKopecks),
      paidAt: payment.paidAt ? formatDateTime(payment.paidAt) : '—',
      createdAt: formatDateTime(payment.createdAt),
    })),
    devices: user.devices.map((device) => ({
      hwid: device.hwid,
      platform: device.platform || 'Неизвестное устройство',
      ip: device.ip || 'IP не записан',
      lastSeenAt: formatDateTime(device.lastSeenAt),
    })),
  }
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    USER: 'Пользователь',
    MODERATOR: 'Модератор',
    ADMIN: 'Администратор',
    SUPER_ADMIN: 'Главный администратор',
  }
  return labels[role] ?? role
}

function roleBadgeClass(role: string) {
  if (role === 'SUPER_ADMIN') return 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200'
  if (role === 'ADMIN') return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200'
  if (role === 'MODERATOR') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
  return 'bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-slate-300'
}

function formatTraffic(used: bigint, limit: bigint | null) {
  const usedLabel = formatBytes(used)
  return limit ? `${usedLabel} из ${formatBytes(limit)}` : `${usedLabel} · безлимит`
}

function formatBytes(value: bigint) {
  const gb = Number(value) / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = Number(value) / 1024 ** 2
  if (mb >= 1) return `${mb.toFixed(2)} MB`
  return `${value.toString()} B`
}

function formatDate(value: Date) {
  return value.toLocaleDateString('ru-RU')
}

function formatDateTime(value: Date) {
  return value.toLocaleString('ru-RU')
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-center gap-1 rounded-lg bg-white px-1.5 py-2 dark:bg-white/[0.035] lg:inline-flex lg:justify-start lg:rounded-none lg:bg-transparent lg:p-0 lg:dark:bg-transparent">
      <span className="font-semibold text-slate-800 dark:text-slate-100">{value}</span>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  )
}

function UserActions({
  user,
  subscriptionPlanId,
  attemptsCount,
  actorRole,
  plans,
  showLabels = false,
}: {
  user: {
    id: string
    email: string
    name: string | null
    role: string
    emailVerifiedAt: Date | null
    telegramId: bigint | null
    telegramUsername: string | null
    remnashopUserId: number | null
    remnawaveUuid: string | null
    remnawaveShortUuid: string | null
    remnawaveUsername: string | null
    createdAt: Date
    lastLoginAt: Date | null
    subscriptions: Parameters<typeof buildUserDetails>[0]['subscriptions']
    payments: Parameters<typeof buildUserDetails>[0]['payments']
    devices: Parameters<typeof buildUserDetails>[0]['devices']
  }
  subscriptionPlanId: string | null
  attemptsCount: number
  actorRole: string
  plans: Array<{ id: string; name: string; priceKopecks: number; durationDays: number; isActive: boolean }>
  showLabels?: boolean
}) {
  const canManageUser = actorRole === 'SUPER_ADMIN' || user.role !== 'SUPER_ADMIN'

  return (
    <>
      <UserDetailsButton details={buildUserDetails(user)} showLabel={showLabels} />
      <UserSyncButton userId={user.id} showLabel={showLabels} />
      {actorRole === 'SUPER_ADMIN' && (
        <BonusBoxAttemptsButton
          userId={user.id}
          email={user.email}
          attemptsCount={attemptsCount}
          showLabel={showLabels}
        />
      )}
      {canManageUser && (
        <UserPlanButton
          userId={user.id}
          email={user.email}
          currentPlanId={subscriptionPlanId}
          plans={plans}
          showLabel={showLabels}
        />
      )}
      {canManageUser && (
        <UserProfileEditButton
          userId={user.id}
          email={user.email}
          name={user.name}
          emailVerified={Boolean(user.emailVerifiedAt)}
          telegramId={user.telegramId?.toString() ?? null}
          telegramUsername={user.telegramUsername}
          remnashopUserId={user.remnashopUserId}
          remnawaveUuid={user.remnawaveUuid}
          remnawaveShortUuid={user.remnawaveShortUuid}
          remnawaveUsername={user.remnawaveUsername}
          showLabel={showLabels}
        />
      )}
    </>
  )
}

function DetailPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/[0.07] dark:bg-white/[0.035]">
      <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function DetailRow({
  label,
  value,
  ok,
  mono,
}: {
  label: string
  value: string | number | null
  ok?: boolean
  mono?: boolean
}) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-white/[0.03] sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`flex min-w-0 items-center gap-2 font-medium text-slate-800 dark:text-slate-100 ${mono ? 'font-mono text-xs' : ''}`}>
        {ok !== undefined && (ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <XCircle className="h-4 w-4 shrink-0 text-slate-400" />)}
        <span className={mono ? 'min-w-0 break-all' : 'min-w-0 truncate'}>{value ?? '—'}</span>
      </div>
    </div>
  )
}
