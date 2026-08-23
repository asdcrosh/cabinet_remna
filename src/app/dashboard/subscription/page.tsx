// /dashboard/subscription — единая ссылка подписки, QR-код и управление доступом.

import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError, remnawaveUserReference } from '@/lib/remnawave'
import { KeysCard } from '@/components/dashboard/keys-card'
import { DevicesList } from '@/components/dashboard/devices-list'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Clock3, Gauge, Globe2, ShieldAlert, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { EmptyState } from '@/components/dashboard/empty-state'
import { getFeatureFlags } from '@/lib/feature-flags'
import { formatSubscriptionDaysLeft, isSubscriptionExpired } from '@/lib/subscription-time'
import { PageHeader } from '@/components/dashboard/page-header'
import { VpnConnectionCheck } from '@/components/dashboard/vpn-connection-check'
import { isWhitelistAddonCurrentlyActive } from '@/lib/whitelist-addon-policy'
import { readPlanPurchaseSnapshot } from '@/lib/plan-purchase'
import { logError } from '@/lib/logger'
import { SubscriptionPendingRefresh } from '@/components/dashboard/subscription-pending-refresh'

export const dynamic = 'force-dynamic'

export default async function SubscriptionPage() {
  const features = await getFeatureFlags()
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const [user, localSubscription, payments, auditEvents] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.uid } }),
    prisma.subscription.findFirst({
      where: { userId: session.uid, status: { in: ['ACTIVE', 'LIMITED', 'PAUSED'] } },
      orderBy: { expireAt: 'desc' },
      select: {
        planId: true,
        status: true,
        expireAt: true,
        deviceLimit: true,
        whitelistAddonActive: true,
        whitelistAddonExpireAt: true,
        graceExpireAt: true,
        plan: {
          select: {
            name: true,
            deviceLimit: true,
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: { userId: session.uid, status: { in: ['SUCCEEDED', 'REFUNDED'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, purchaseType: true, status: true, createdAt: true, paidAt: true, planSnapshot: true, plan: { select: { name: true } } },
    }).catch((error) => {
      logError('subscription.timeline_payments_failed', error, { userId: session.uid })
      return []
    }),
    prisma.auditLog.findMany({
      where: {
        targetId: session.uid,
        OR: [
          { action: { in: ['ADMIN_PLAN_ASSIGNED', 'ADMIN_SUBSCRIPTION_DISABLED', 'ADMIN_SUBSCRIPTION_DELETED'] } },
          {
            action: 'ADMIN_FEATURES_UPDATED',
            OR: [{ message: { contains: 'БС' } }, { message: { contains: 'льгот' } }, { message: { contains: 'Льгот' } }],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, message: true, createdAt: true },
    }).catch((error) => {
      logError('subscription.timeline_audit_failed', error, { userId: session.uid })
      return []
    }),
  ])
  if (!user?.remnawaveUsername) {
    return (
      <EmptyState
        title="Подписки пока нет"
        description="Выберите срок доступа. Ссылка и подключение появятся здесь сразу после оплаты."
        icon={<ShieldAlert className="h-7 w-7" />}
        action={<Link href="/dashboard/plans" className="btn-primary">Выбрать тариф</Link>}
      />
    )
  }

  let data
  try {
    data = await remnawave.getSubscriptionByUsername(user.remnawaveUsername)
  } catch (e) {
    logError('subscription.remnawave_load_failed', e, {
      userId: session.uid,
      remnawaveStatus: e instanceof RemnawaveError ? e.status : null,
    })
    return <SubscriptionUnavailable supportEnabled={features.support} />
  }

  if (!data.response.isFound || !data.response.user) {
    return (
      <EmptyState
        title="Подписка настраивается"
        description="Оплата получена. Профиль подключения ещё создаётся, страница обновится после завершения настройки."
        icon={<Sparkles className="h-7 w-7" />}
        action={(
          <>
            <SubscriptionPendingRefresh />
            <Link href="/dashboard/subscription" className="btn-primary">Проверить снова</Link>
          </>
        )}
      />
    )
  }

  let happLink = data.response.happ?.cryptoLink
  if (!happLink && data.response.user.shortUuid) {
    try {
      const publicData = await remnawave.getSubscriptionByShortUuid(data.response.user.shortUuid)
      happLink = publicData.response.happ?.cryptoLink
    } catch {
      happLink = undefined
    }
  }

  const u = data.response.user
  const isUnlimited = u.trafficLimitBytes === '0'
  const graceActive = Boolean(localSubscription?.graceExpireAt && localSubscription.graceExpireAt > new Date())
  const subscriptionExpired = !graceActive && isSubscriptionExpired(u.daysLeft, u.userStatus)
  const expiresAtLabel = new Date(u.expiresAt).toLocaleDateString('ru-RU')
  const whitelistAddonActive = Boolean(
    localSubscription && isWhitelistAddonCurrentlyActive(localSubscription)
  )
  const whitelistAddonExpireAtLabel = localSubscription?.whitelistAddonExpireAt
    ?.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) ?? null
  let isFirstConnection = false
  if (!subscriptionExpired) {
    try {
      const devices = await remnawave.getUserDevices(remnawaveUserReference(user))
      isFirstConnection = devices.response.devices.length === 0
    } catch {
      // Не прячем управление у существующего пользователя, если Remnawave временно не ответил.
    }
  }
  const statusText = graceActive
    ? 'Льготный период'
    : subscriptionExpired
    ? 'Подписка истекла'
    : u.isActive
      ? 'Подписка активна'
      : 'Подписка не активна'

  return (
    <div className="user-workspace page-stack">
      <PageHeader
        title="Подключение"
        description={isFirstConnection
          ? 'Подключите первое устройство за три шага.'
          : 'Откройте подписку в INСY и управляйте подключёнными устройствами.'}
      />

      <section
        data-testid="subscription-access"
        className={cn('connection-access-summary', subscriptionExpired && 'connection-access-summary--expired')}
      >
        <div className="connection-access-summary__intro">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${subscriptionExpired ? 'bg-amber-500' : u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">{statusText}</h2>
              <span className="text-sm text-slate-400">·</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {localSubscription?.plan?.name ?? 'VPN-подписка'}
              </span>
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
              {graceActive
                ? `Доступ сохранён до ${localSubscription?.graceExpireAt?.toLocaleString('ru-RU')}. Оплатите тариф, чтобы не потерять подключение.`
                : subscriptionExpired
                ? 'Продлите доступ, затем ссылка и устройства снова заработают без новой настройки.'
                : isFirstConnection
                  ? 'Ссылка готова. Установите приложение, откройте подписку и включите VPN.'
                  : 'Ссылка готова. Подключите новое устройство или управляйте теми, что уже добавлены.'}
            </p>
          </div>

          <div className="connection-access-summary__action">
            <Link
              href="/dashboard/plans?intent=renew"
              className={`${subscriptionExpired ? 'btn-primary' : 'btn-secondary'} group w-full justify-between min-[1360px]:min-w-44`}
            >
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Продлить
              </span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        <div className={cn(
          'connection-access-summary__metrics',
          whitelistAddonActive && 'connection-access-summary__metrics--with-addon'
        )}>
          <AccessMetric
            icon={<Sparkles className="h-4 w-4" />}
            label="Доступ"
            value={formatSubscriptionDaysLeft(u.daysLeft, u.userStatus)}
          />
          <AccessMetric
            icon={<CalendarDays className="h-4 w-4" />}
            label={subscriptionExpired ? 'Завершилась' : 'Оплачено до'}
            value={expiresAtLabel}
          />
          {whitelistAddonActive && whitelistAddonExpireAtLabel ? (
            <AccessMetric
              icon={<Globe2 className="h-4 w-4" />}
              label="БС действуют до"
              value={whitelistAddonExpireAtLabel}
            />
          ) : null}
          <AccessMetric
            icon={<Gauge className="h-4 w-4" />}
            label="Трафик"
            value={subscriptionExpired
              ? '0 доступно'
              : `${u.trafficUsed}${isUnlimited ? ' · безлимит' : ` из ${u.trafficLimit}`}`}
          />
        </div>
      </section>

      <SubscriptionTimeline payments={payments} auditEvents={auditEvents} />

      {!subscriptionExpired && (
        isFirstConnection ? (
          <KeysCard
            subscriptionUrl={data.response.subscriptionUrl}
            happLink={happLink}
            onboarding
            supportEnabled={features.support}
          />
        ) : (
          <>
            <VpnConnectionCheck
              supportEnabled={features.support}
              deviceLimit={localSubscription?.deviceLimit ?? localSubscription?.plan?.deviceLimit}
            />
            <div className="grid items-start gap-5 min-[1360px]:grid-cols-[minmax(0,1fr)_22rem]">
              <KeysCard subscriptionUrl={data.response.subscriptionUrl} happLink={happLink} />
              <DevicesList
                embedded
                deviceLimit={localSubscription?.deviceLimit ?? localSubscription?.plan?.deviceLimit}
                subscriptionUrl={data.response.subscriptionUrl}
              />
            </div>
          </>
        )
      )}
    </div>
  )
}

function SubscriptionUnavailable({ supportEnabled }: { supportEnabled: boolean }) {
  return (
    <EmptyState
      title="Не удалось загрузить подписку"
      description={supportEnabled
        ? 'Сервис временно недоступен. Можно повторить загрузку или написать в поддержку.'
        : 'Сервис временно недоступен. Повторите загрузку чуть позже.'}
      icon={<ShieldAlert className="h-7 w-7" />}
      action={(
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/dashboard/subscription" className="btn-primary">Обновить</Link>
          {supportEnabled && <Link href="/dashboard/support" className="btn-secondary">В поддержку</Link>}
        </div>
      )}
    />
  )
}

function SubscriptionTimeline({
  payments,
  auditEvents,
}: {
  payments: Array<{ id: string; purchaseType: string; status: string; createdAt: Date; paidAt: Date | null; planSnapshot: unknown; plan: { name: string } }>
  auditEvents: Array<{ id: string; message: string; createdAt: Date }>
}) {
  const chronological = [...payments].reverse()
  let subscriptionPurchases = 0
  const paymentItems = chronological.map((payment) => {
    const snapshot = readPlanPurchaseSnapshot(payment.planSnapshot)
    let title: string
    if (payment.purchaseType === 'WHITELIST_ADDON') title = payment.status === 'REFUNDED' ? 'БС отключены' : 'БС подключены'
    else if (snapshot?.switchFromPlan) title = `Смена тарифа: ${snapshot.switchFromPlan.name} → ${snapshot.name}`
    else title = subscriptionPurchases === 0 ? `Тариф «${snapshot?.name ?? payment.plan.name}» подключён` : `Тариф «${snapshot?.name ?? payment.plan.name}» продлён`
    if (payment.purchaseType !== 'WHITELIST_ADDON') subscriptionPurchases += 1
    return { id: `payment-${payment.id}`, title, createdAt: payment.paidAt ?? payment.createdAt }
  })
  const items = [...paymentItems, ...auditEvents.map((event) => ({ id: `audit-${event.id}`, title: event.message, createdAt: event.createdAt }))]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 12)
  if (items.length === 0) return null
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/[0.09] dark:bg-white/[0.025] sm:p-5">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-slate-400" />
        <h2 className="font-semibold">История подписки</h2>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex gap-3 border-l-2 border-cyan-500/40 pl-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</div>
              <div className="mt-0.5 text-xs text-slate-400">{item.createdAt.toLocaleString('ru-RU')}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function AccessMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs uppercase tracking-[0.07em] text-slate-400">{label}</span>
        <strong className="mt-1 block break-words text-sm text-slate-950 dark:text-white">{value}</strong>
      </span>
    </div>
  )
}
