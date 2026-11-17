import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ChevronDown, ExternalLink, XCircle } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { getFeatureFlags } from '@/lib/feature-flags'
import { formatPrice } from '@/lib/format'
import { paymentProviderLabel } from '@/lib/payment-provider-label'
import { supportCategoryLabel, supportStatusLabelForRole } from '@/lib/support'
import { formatDeviceClientName } from '@/lib/device-client'
import { cn } from '@/lib/cn'
import { buildAdminSupportPath } from '@/components/support/support-panel-model'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { PaymentBadge, SubscriptionBadge } from '@/components/admin/admin-badges'
import { AdminEmptyState } from '@/components/admin/admin-empty-state'
import { UserPlanButton, type UserPlanOption } from '@/components/admin/user-plan-button'
import { UserSyncButton } from '@/components/admin/user-sync-button'
import { BonusBoxAttemptsButton } from '@/components/admin/bonus-box-attempts-button'
import { UserWhitelistAddonButton } from '@/components/admin/user-whitelist-addon-button'
import { UserProfileEditButton } from '@/components/admin/user-profile-edit-button'
import { UserRoleSelect } from '@/components/admin/user-role-select'
import { UserSubscriptionDeleteButton } from '@/components/admin/user-subscription-delete-button'
import {
  buildUserCardHref,
  findActiveSubscription,
  formatSubscriptionDeviceLimit,
  formatSubscriptionTraffic,
  formatUserCardAccountLabel,
  getUserCardPermissions,
  getWhitelistAddonState,
  hasVpnProfile,
  isTechnicalAccountEmail,
  isWhitelistAddonActive,
  parseUserCardTab,
  pickCurrentSubscription,
  userCardRoleBadgeClass,
  userCardRoleLabel,
  type UserCardTab,
} from '@/components/admin/user-card-model'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Карточка клиента — Админка' }

const SUBSCRIPTIONS_LIMIT = 20
const PAYMENTS_LIMIT = 30
const DEVICES_LIMIT = 50
const TICKETS_LIMIT = 30
const AUDIT_LIMIT = 30

export default async function AdminUserCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string | string[] }>
}) {
  const { session, user: actor } = await requireAdminPage()
  const [{ id }, query] = await Promise.all([params, searchParams])

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      personalDiscountPercent: true,
      nextPurchaseDiscountPercent: true,
      telegramId: true,
      telegramUsername: true,
      emailVerifiedAt: true,
      remnashopUserId: true,
      remnawaveId: true,
      remnawaveUuid: true,
      remnawaveShortUuid: true,
      remnawaveUsername: true,
      createdAt: true,
      lastLoginAt: true,
      subscriptions: {
        orderBy: { expireAt: 'desc' },
        take: SUBSCRIPTIONS_LIMIT,
        include: { plan: { select: { id: true, name: true, deviceLimit: true, unlimitedDevices: true } } },
      },
      _count: {
        select: {
          payments: true,
          subscriptions: true,
          devices: true,
          supportTickets: true,
          auditLogsTargeted: true,
        },
      },
    },
  })
  if (!user) notFound()

  const now = new Date()
  const latestSubscription = user.subscriptions[0] ?? null
  const permissions = getUserCardPermissions({
    actorRole: actor.role,
    targetRole: user.role,
    latestSubscriptionStatus: latestSubscription?.status ?? null,
  })
  const tab = parseUserCardTab(query.tab, { canViewHistory: permissions.canViewHistory })
  const currentSubscription = pickCurrentSubscription(user.subscriptions, now)
  const activeSubscription = findActiveSubscription(user.subscriptions, now)

  const [plans, attemptsCount, features] = await Promise.all([
    permissions.canManageUser
      ? prisma.plan.findMany({
          orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
          select: { id: true, name: true, priceKopecks: true, durationDays: true, isActive: true },
        })
      : Promise.resolve<UserPlanOption[]>([]),
    permissions.canGrantBonusAttempts
      ? prisma.bonusBoxAttempt.count({
          where: {
            userId: user.id,
            usedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        })
      : Promise.resolve(0),
    getFeatureFlags(),
  ])

  const accountLabel = formatUserCardAccountLabel(user)
  const vpnReady = hasVpnProfile(user)
  const tabs: Array<{ value: UserCardTab; label: string; count: number }> = [
    { value: 'subscription', label: 'Подписка', count: user._count.subscriptions },
    { value: 'payments', label: 'Платежи', count: user._count.payments },
    { value: 'devices', label: 'Устройства', count: user._count.devices },
    { value: 'support', label: 'Обращения', count: user._count.supportTickets },
    ...(permissions.canViewHistory
      ? [{ value: 'history' as const, label: 'История', count: user._count.auditLogsTargeted }]
      : []),
  ]

  return (
    <AdminPageShell
      variant="plain"
      title="Карточка клиента"
      description="Профиль, подписка и история клиента"
      action={
        <Link href="/dashboard/admin/users" className="btn-secondary">
          <ArrowLeft className="h-4 w-4" />
          Клиенты
        </Link>
      }
    >
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/[0.07] dark:bg-white/[0.025] sm:p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,21rem)]">
          <div className="min-w-0">
            <h2 className="break-all text-lg font-semibold leading-6 text-slate-950 dark:text-white sm:text-xl">{accountLabel}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex min-h-7 max-w-full items-center rounded-full px-2.5 text-xs font-medium ${userCardRoleBadgeClass(user.role)}`}>
                {userCardRoleLabel(user.role)}
              </span>
              <span
                className={cn(
                  'inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
                  vpnReady
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400'
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', vpnReady ? 'bg-emerald-500' : 'bg-slate-400')} />
                {vpnReady ? 'VPN-профиль готов' : 'Без VPN-профиля'}
              </span>
              {user.personalDiscountPercent > 0 ? (
                <span className="text-xs font-medium text-violet-600 dark:text-violet-300">Персональная скидка {user.personalDiscountPercent}%</span>
              ) : null}
              {user.nextPurchaseDiscountPercent > 0 ? (
                <span className="text-xs font-medium text-fuchsia-600 dark:text-fuchsia-300">Следующая покупка −{user.nextPurchaseDiscountPercent}%</span>
              ) : null}
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryItem label="Имя" value={user.name || 'Без имени'} />
              <SummaryItem
                label="Email"
                value={isTechnicalAccountEmail(user.email) ? 'Не указан' : user.email}
              />
              <SummaryItem
                label="Telegram"
                value={user.telegramId ? `@${user.telegramUsername || user.telegramId.toString()}` : 'Не привязан'}
              />
              <SummaryItem label="Регистрация" value={formatDate(user.createdAt)} />
            </dl>
          </div>

          <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/[0.07] dark:bg-white/[0.03]">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Текущая подписка</div>
            {currentSubscription ? (
              <div className="mt-2 min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <SubscriptionBadge status={currentSubscription.status} />
                  <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {currentSubscription.plan?.name || 'Без тарифа'}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-500">до {formatDate(currentSubscription.expireAt)}</div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-400">Подписки нет</div>
            )}
          </div>
        </div>

        <details className="group mt-4 border-t border-slate-100 pt-3 dark:border-white/10">
          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between text-xs font-medium text-slate-500">
            <span>Связи и VPN-профиль</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            <DetailPanel title="Связи">
              <DetailRow label="Email" value={user.emailVerifiedAt ? user.emailVerifiedAt.toLocaleDateString('ru-RU') : 'Не подтверждён'} ok={Boolean(user.emailVerifiedAt)} />
              <DetailRow label="Telegram" value={user.telegramId ? `${user.telegramId}` : 'Не привязан'} ok={Boolean(user.telegramId)} mono />
              <DetailRow label="Remnashop" value={user.remnashopUserId ?? 'Не связан'} ok={Boolean(user.remnashopUserId)} mono />
            </DetailPanel>
            <DetailPanel title="VPN профиль">
              <DetailRow label="ID (v3)" value={user.remnawaveId || '—'} mono />
              <DetailRow label="Username" value={user.remnawaveUsername || 'Не создан'} ok={vpnReady} mono />
              <DetailRow label="UUID" value={user.remnawaveUuid || '—'} mono />
              <DetailRow label="Short UUID" value={user.remnawaveShortUuid || '—'} mono />
            </DetailPanel>
            <DetailPanel title="Аккаунт">
              <DetailRow label="ID" value={user.id} mono />
              <DetailRow label="Логин" value={user.email} mono />
              <DetailRow label="Последний вход" value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Не входил'} />
            </DetailPanel>
          </div>
        </details>
      </section>

      <section aria-label="Действия с клиентом" className="flex flex-wrap items-center gap-2">
        {permissions.canManageUser ? (
          <UserPlanButton
            userId={user.id}
            email={user.email}
            currentPlanId={currentSubscription?.planId ?? null}
            plans={plans}
            showLabel
            primary
            label="Продлить или сменить тариф"
          />
        ) : null}
        <UserSyncButton userId={user.id} showLabel />
        {permissions.canGrantBonusAttempts ? (
          <BonusBoxAttemptsButton
            userId={user.id}
            email={user.email}
            attemptsCount={attemptsCount}
            showLabel
          />
        ) : null}
        {permissions.canManageWhitelistAddon ? (
          <UserWhitelistAddonButton
            userId={user.id}
            email={user.email}
            available={Boolean(activeSubscription)}
            active={isWhitelistAddonActive(activeSubscription, now)}
            expireAt={activeSubscription?.whitelistAddonExpireAt?.toISOString() ?? null}
            showLabel
          />
        ) : null}
        {permissions.canManageUser ? (
          <UserProfileEditButton
            userId={user.id}
            email={user.email}
            name={user.name}
            emailVerified={Boolean(user.emailVerifiedAt)}
            telegramId={user.telegramId?.toString() ?? null}
            telegramUsername={user.telegramUsername}
            remnashopUserId={user.remnashopUserId}
            remnawaveId={user.remnawaveId}
            remnawaveUuid={user.remnawaveUuid}
            remnawaveShortUuid={user.remnawaveShortUuid}
            remnawaveUsername={user.remnawaveUsername}
            personalDiscountPercent={user.personalDiscountPercent}
            nextPurchaseDiscountPercent={user.nextPurchaseDiscountPercent}
            canManageDiscounts={permissions.canManageDiscounts}
            showLabel
          />
        ) : null}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Роль</span>
          <UserRoleSelect
            userId={user.id}
            role={user.role}
            actorId={session.uid}
            actorRole={actor.role}
          />
        </div>
        {permissions.canDisableSubscription ? (
          <div className="sm:ml-auto">
            <UserSubscriptionDeleteButton userId={user.id} email={user.email} showLabel />
          </div>
        ) : null}
      </section>

      <nav
        aria-label="Разделы карточки клиента"
        className="inline-flex max-w-full gap-1 self-start overflow-x-auto rounded-[12px] border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.03]"
      >
        {tabs.map((item) => {
          const selected = item.value === tab
          return (
            <Link
              key={item.value}
              href={buildUserCardHref(user.id, item.value)}
              scroll={false}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] px-3 text-sm font-semibold text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                selected && 'bg-slate-950 text-white hover:text-white dark:bg-white dark:text-slate-950 dark:hover:text-slate-950'
              )}
            >
              {item.label}
              <span className="text-xs font-medium opacity-60">{item.count}</span>
            </Link>
          )
        })}
      </nav>

      {tab === 'subscription' ? (
        <SubscriptionsPanel subscriptions={user.subscriptions} total={user._count.subscriptions} now={now} />
      ) : null}
      {tab === 'payments' ? (
        <PaymentsPanel userId={user.id} email={user.email} total={user._count.payments} />
      ) : null}
      {tab === 'devices' ? (
        <DevicesPanel userId={user.id} total={user._count.devices} />
      ) : null}
      {tab === 'support' ? (
        <SupportPanel userId={user.id} email={user.email} total={user._count.supportTickets} supportEnabled={features.support} />
      ) : null}
      {tab === 'history' && permissions.canViewHistory ? (
        <HistoryPanel userId={user.id} email={user.email} total={user._count.auditLogsTargeted} />
      ) : null}
    </AdminPageShell>
  )
}

function SubscriptionsPanel({
  subscriptions,
  total,
  now,
}: {
  subscriptions: Array<{
    id: string
    status: string
    startAt: Date
    expireAt: Date
    deviceLimit: number | null
    trafficLimitBytes: bigint | null
    trafficUsedBytes: bigint
    lastSyncedAt: Date
    whitelistAddonActive: boolean
    whitelistAddonExpireAt: Date | null
    whitelistAddonRemainingSeconds: bigint | null
    plan: { name: string; deviceLimit: number; unlimitedDevices: boolean } | null
  }>
  total: number
  now: Date
}) {
  if (subscriptions.length === 0) {
    return <AdminEmptyState title="Подписок нет" description="Назначьте тариф, чтобы выдать клиенту доступ." />
  }

  return (
    <PanelList footer={total > subscriptions.length ? `Показаны последние ${subscriptions.length} из ${total}` : null}>
      {subscriptions.map((subscription) => {
        const whitelistState = getWhitelistAddonState(subscription, now)
        return (
          <article key={subscription.id} className="px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <SubscriptionBadge status={subscription.status} />
                <span className="truncate font-semibold">{subscription.plan?.name || 'Без тарифа'}</span>
              </div>
              <span className="text-xs text-slate-500">Синхронизация: {formatDateTime(subscription.lastSyncedAt)}</span>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryItem label="Старт" value={formatDate(subscription.startAt)} />
              <SummaryItem label="До" value={formatDate(subscription.expireAt)} />
              <SummaryItem label="Устройства" value={formatSubscriptionDeviceLimit(subscription)} />
              <SummaryItem label="Трафик" value={formatSubscriptionTraffic(subscription.trafficUsedBytes, subscription.trafficLimitBytes)} />
              <SummaryItem
                label="Белые списки"
                value={whitelistState === 'ACTIVE' && subscription.whitelistAddonExpireAt
                  ? `Подключены до ${formatDate(subscription.whitelistAddonExpireAt)}`
                  : whitelistState === 'PAUSED'
                    ? 'На паузе'
                    : 'Не подключены'}
                tone={whitelistState === 'ACTIVE' ? 'success' : whitelistState === 'PAUSED' ? 'info' : 'muted'}
              />
            </dl>
          </article>
        )
      })}
    </PanelList>
  )
}

async function PaymentsPanel({ userId, email, total }: { userId: string; email: string; total: number }) {
  const payments = await prisma.payment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: PAYMENTS_LIMIT,
    select: {
      id: true,
      status: true,
      provider: true,
      amountKopecks: true,
      paidAt: true,
      createdAt: true,
      plan: { select: { name: true } },
    },
  })

  if (payments.length === 0) {
    return <AdminEmptyState title="Платежей нет" description="Клиент ещё не оформлял оплату." />
  }

  return (
    <PanelList
      footer={total > payments.length ? `Показаны последние ${payments.length} из ${total}` : null}
      action={<SectionLink href={`/dashboard/admin/payments?q=${encodeURIComponent(email)}`}>Все платежи клиента</SectionLink>}
    >
      {payments.map((payment) => (
        <Link
          key={payment.id}
          href={`/dashboard/admin/payments?q=${encodeURIComponent(payment.id)}`}
          className="grid gap-2 px-4 py-3.5 transition hover:bg-slate-50 dark:hover:bg-white/[0.03] md:grid-cols-[minmax(0,1fr)_9rem_8rem_7rem] md:items-center md:gap-4"
        >
          <div className="min-w-0">
            <div className="truncate font-semibold">{payment.plan.name}</div>
            <div className="truncate font-mono text-xs text-slate-400">{payment.id}</div>
          </div>
          <div className="text-sm text-slate-500">
            {formatDateTime(payment.createdAt)}
            {payment.paidAt ? <div className="text-xs text-slate-400">оплачен {formatDateTime(payment.paidAt)}</div> : null}
          </div>
          <div className="text-sm text-slate-500">{paymentProviderLabel(payment.provider)}</div>
          <div className="flex items-center gap-2 md:flex-col md:items-end md:gap-1">
            <span className="font-semibold">{formatPrice(payment.amountKopecks)}</span>
            <PaymentBadge status={payment.status} />
          </div>
        </Link>
      ))}
    </PanelList>
  )
}

async function DevicesPanel({ userId, total }: { userId: string; total: number }) {
  const devices = await prisma.device.findMany({
    where: { userId },
    orderBy: { lastSeenAt: 'desc' },
    take: DEVICES_LIMIT,
    select: {
      id: true,
      hwid: true,
      displayName: true,
      platform: true,
      userAgent: true,
      ip: true,
      firstSeenAt: true,
      lastSeenAt: true,
    },
  })

  if (devices.length === 0) {
    return <AdminEmptyState title="Устройств нет" description="Устройства появятся после подключения к VPN и синхронизации." />
  }

  return (
    <PanelList footer={total > devices.length ? `Показаны последние ${devices.length} из ${total}` : null}>
      {devices.map((device) => {
        const client = formatDeviceClientName(device.userAgent)
        return (
          <article key={device.id} className="grid gap-2 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_10rem_12rem] md:items-center md:gap-4">
            <div className="min-w-0">
              <div className="truncate font-semibold">
                {device.displayName || device.platform || 'Неизвестное устройство'}
                {client ? <span className="font-normal text-slate-500"> · {client}</span> : null}
              </div>
              <div className="truncate font-mono text-xs text-slate-400">{device.hwid}</div>
            </div>
            <div className="truncate text-sm text-slate-500">{device.ip || 'IP не записан'}</div>
            <div className="text-sm text-slate-500 md:text-right">
              {formatDateTime(device.lastSeenAt)}
              <div className="text-xs text-slate-400">с {formatDate(device.firstSeenAt)}</div>
            </div>
          </article>
        )
      })}
    </PanelList>
  )
}

async function SupportPanel({
  userId,
  email,
  total,
  supportEnabled,
}: {
  userId: string
  email: string
  total: number
  supportEnabled: boolean
}) {
  const tickets = await prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { lastMessageAt: 'desc' },
    take: TICKETS_LIMIT,
    select: {
      id: true,
      subject: true,
      category: true,
      status: true,
      adminUnreadCount: true,
      lastMessageAt: true,
      createdAt: true,
      assignee: { select: { email: true, name: true } },
    },
  })

  if (tickets.length === 0) {
    return <AdminEmptyState title="Обращений нет" description="Клиент ещё не писал в поддержку." />
  }

  return (
    <PanelList
      footer={total > tickets.length ? `Показаны последние ${tickets.length} из ${total}` : null}
      action={supportEnabled
        ? <SectionLink href={`/dashboard/admin/support?q=${encodeURIComponent(email)}`}>Все обращения клиента</SectionLink>
        : <span className="text-xs text-slate-400">Поддержка отключена</span>}
    >
      {tickets.map((ticket) => {
        const content = (
          <>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-semibold">{ticket.subject}</span>
                {ticket.adminUnreadCount > 0 ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
                    {ticket.adminUnreadCount} нов.
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 truncate text-xs text-slate-500">
                {supportCategoryLabel(ticket.category)}
                {' · '}
                {ticket.assignee ? `Исполнитель: ${ticket.assignee.name || ticket.assignee.email}` : 'Без исполнителя'}
              </div>
            </div>
            <div className="text-sm text-slate-500">
              {formatDateTime(ticket.lastMessageAt)}
              <div className="text-xs text-slate-400">создано {formatDate(ticket.createdAt)}</div>
            </div>
            <div className="md:text-right">
              <span className={supportStatusClass(ticket.status)}>{supportStatusLabelForRole(ticket.status, 'admin')}</span>
            </div>
          </>
        )
        const className = 'grid gap-2 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_10rem_9rem] md:items-center md:gap-4'
        return supportEnabled ? (
          <Link
            key={ticket.id}
            href={buildAdminSupportPath({
              folder: ticket.status === 'CLOSED' ? 'closed' : 'active',
              assigneeScope: 'all',
              ticketId: ticket.id,
            })}
            className={cn(className, 'transition hover:bg-slate-50 dark:hover:bg-white/[0.03]')}
          >
            {content}
          </Link>
        ) : (
          <article key={ticket.id} className={className}>{content}</article>
        )
      })}
    </PanelList>
  )
}

async function HistoryPanel({ userId, email, total }: { userId: string; email: string; total: number }) {
  const logs = await prisma.auditLog.findMany({
    where: { targetId: userId },
    orderBy: { createdAt: 'desc' },
    take: AUDIT_LIMIT,
    select: {
      id: true,
      message: true,
      createdAt: true,
      actor: { select: { email: true } },
    },
  })

  if (logs.length === 0) {
    return <AdminEmptyState title="Записей пока нет" description="Здесь появятся действия администраторов с этим клиентом." />
  }

  return (
    <PanelList
      footer={total > logs.length ? `Показаны последние ${logs.length} из ${total}` : null}
      action={<SectionLink href={`/dashboard/admin/audit?q=${encodeURIComponent(email)}`}>Открыть в журнале</SectionLink>}
    >
      {logs.map((log) => (
        <article key={log.id} className="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="font-semibold leading-5">{log.message}</div>
            <div className="mt-0.5 text-xs text-slate-500">{log.actor ? `Автор: ${log.actor.email}` : 'Системное действие'}</div>
          </div>
          <div className="shrink-0 text-xs text-slate-500">{formatDateTime(log.createdAt)}</div>
        </article>
      ))}
    </PanelList>
  )
}

function PanelList({ children, footer, action }: { children: ReactNode; footer?: string | null; action?: ReactNode }) {
  return (
    <section className="space-y-2">
      {action ? <div className="flex justify-end">{action}</div> : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 dark:border-white/[0.07] dark:bg-white/[0.025] dark:divide-white/[0.07]">
        {children}
      </div>
      {footer ? <p className="px-1 text-xs text-slate-400">{footer}</p> : null}
    </section>
  )
}

function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300">
      {children}
      <ExternalLink className="h-3.5 w-3.5" />
    </Link>
  )
}

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'success' | 'info' | 'muted'
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 break-words text-sm font-medium text-slate-800 dark:text-slate-100',
          tone === 'success' && 'text-emerald-700 dark:text-emerald-300',
          tone === 'info' && 'text-cyan-700 dark:text-cyan-300',
          tone === 'muted' && 'text-slate-400 dark:text-slate-500'
        )}
      >
        {value}
      </dd>
    </div>
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

function supportStatusClass(status: string) {
  if (status === 'WAITING_ADMIN' || status === 'OPEN') return 'badge-limited'
  if (status === 'WAITING_USER') return 'badge-active'
  return 'badge-muted'
}

function formatDate(value: Date) {
  return value.toLocaleDateString('ru-RU')
}

function formatDateTime(value: Date) {
  return value.toLocaleString('ru-RU')
}
