// /dashboard/subscription — единая ссылка подписки, QR-код и управление доступом.

import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError } from '@/lib/remnawave'
import { ConnectionPage } from '@/components/dashboard/connection-page'
import Link from 'next/link'
import { ArrowRight, CalendarDays, ChevronDown, Clock3, Gauge, Globe2, ShieldAlert, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { EmptyState } from '@/components/dashboard/empty-state'
import { getFeatureFlags } from '@/lib/feature-flags'
import { formatSubscriptionDaysLeft } from '@/lib/subscription-time'
import { resolveSubscriptionPresentation } from '@/lib/subscription-presentation'
import { isWhitelistAddonCurrentlyActive } from '@/lib/whitelist-addon-policy'
import { readPlanPurchaseSnapshot } from '@/lib/plan-purchase'
import { logError } from '@/lib/logger'
import { SubscriptionPendingRefresh } from '@/components/dashboard/subscription-pending-refresh'
import { AutoRenewalCard } from '@/components/dashboard/auto-renewal-card'
import { getAutoRenewalState } from '@/lib/auto-renewal'
import { getRetentionState } from '@/lib/subscription-retention'
import { tryCalculateRenewalPricing } from '@/lib/renewal-pricing'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { PageHeader } from '@/components/dashboard/page-header'

export const dynamic = 'force-dynamic'

export default async function SubscriptionPage() {
  const features = await getFeatureFlags()
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const [user, localSubscription, payments, auditEvents, autoRenewal, retentionPause] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.uid }, include: { _count: { select: { devices: true } } } }),
    prisma.subscription.findFirst({
      where: { userId: session.uid },
      orderBy: { expireAt: 'desc' },
      select: {
        planId: true,
        status: true,
        expireAt: true,
        deviceLimit: true,
        whitelistAddonActive: true,
        whitelistAddonExpireAt: true,
        graceExpireAt: true,
        pendingSync: true,
        lastSyncedAt: true,
        plan: {
          select: {
            name: true,
            priceKopecks: true,
            durationDays: true,
            deviceLimit: true,
            maxDeviceLimit: true,
            extraDevicePriceKopecks: true,
            unlimitedDevices: true,
            unlimitedDuration: true,
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
    getAutoRenewalState(session.uid),
    getRetentionState(session.uid),
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
    const savedState = localSubscription
      ? resolveSubscriptionPresentation({
          localStatus: localSubscription.status,
          localExpireAt: localSubscription.expireAt,
          graceExpireAt: localSubscription.graceExpireAt,
          unlimitedDuration: localSubscription.plan?.unlimitedDuration,
          pendingSync: localSubscription.pendingSync,
          remoteUnavailable: true,
        })
      : null
    return (
      <SubscriptionUnavailable
        supportEnabled={features.support}
        savedState={savedState}
        planName={localSubscription?.plan?.name ?? null}
        lastSyncedAt={localSubscription?.lastSyncedAt ?? null}
      />
    )
  }

  if (!data.response.isFound || !data.response.user) {
    const hasConfirmedAccess = Boolean(localSubscription) || payments.some((payment) => payment.status === 'SUCCEEDED')
    return (
      <EmptyState
        title={hasConfirmedAccess ? 'Профиль подключения настраивается' : 'Профиль подключения не найден'}
        description={hasConfirmedAccess
          ? 'В кабинете есть подтверждённый доступ, но профиль подключения ещё не появился. Страница обновится после завершения настройки.'
          : 'Сервис подключения пока не вернул профиль. Проверьте историю платежей или выберите тариф.'}
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
  const unlimitedDuration = Boolean(localSubscription?.plan?.unlimitedDuration)
  const subscriptionState = resolveSubscriptionPresentation({
    localStatus: localSubscription?.status,
    remoteStatus: u.userStatus,
    localExpireAt: localSubscription?.expireAt,
    remoteExpireAt: new Date(u.expiresAt),
    remoteDaysLeft: u.daysLeft,
    graceExpireAt: localSubscription?.graceExpireAt,
    unlimitedDuration,
    pendingSync: localSubscription?.pendingSync,
  })
  const graceActive = subscriptionState.phase === 'grace'
  const subscriptionExpired = subscriptionState.requiresRenewal
  const expiresAtLabel = unlimitedDuration
    ? 'Бессрочно'
    : new Date(u.expiresAt).toLocaleDateString('ru-RU')
  const whitelistAddonActive = Boolean(
    localSubscription && isWhitelistAddonCurrentlyActive(localSubscription)
  )
  const whitelistAddonExpireAtLabel = localSubscription?.whitelistAddonExpireAt
    ?.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) ?? null
  const statusText = subscriptionState.title
  const accessIssue = subscriptionState.usable
    ? null
    : { title: subscriptionState.title, description: subscriptionState.description }

  return (
    <ConnectionPage
      subscriptionUrl={data.response.subscriptionUrl}
      happLink={happLink}
      supportEnabled={features.support}
      deviceLimit={localSubscription?.plan?.unlimitedDevices
        ? null
        : localSubscription?.deviceLimit ?? localSubscription?.plan?.deviceLimit}
      expired={subscriptionExpired}
      hasConnectedDevices={user._count.devices > 0}
      accessIssue={accessIssue}
      notice={graceActive ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
          Льготный период до {localSubscription?.graceExpireAt?.toLocaleDateString('ru-RU')}. <Link href="/dashboard/plans?intent=renew" className="underline">Продлить доступ</Link>
        </p>
      ) : null}
    >
      <section
        data-testid="subscription-access"
        className={cn('connection-access-summary', subscriptionExpired && 'connection-access-summary--expired')}
      >
        <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-400/10" />
        <div className="connection-access-summary__intro relative z-10">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1',
              subscriptionExpired
                ? 'bg-amber-500/10 text-amber-700 ring-amber-500/15 dark:text-amber-200'
                : 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/15 dark:text-emerald-200'
            )}>
              {subscriptionExpired ? <ShieldAlert className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-slate-950 dark:text-white">{statusText}</h2>
                <span className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                  subscriptionExpired
                    ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200'
                    : u.isActive
                      ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                      : 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300'
                )}>
                  <span className={`h-1.5 w-1.5 rounded-full ${subscriptionExpired ? 'bg-amber-500' : u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {localSubscription?.plan?.name ?? 'VPN-подписка'}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-5 text-slate-500 dark:text-slate-400">
                {graceActive
                  ? `Доступ сохранён до ${localSubscription?.graceExpireAt?.toLocaleString('ru-RU')}. Оплатите тариф, чтобы не потерять подключение.`
                  : subscriptionState.description}
              </p>
            </div>
          </div>

          <div className="connection-access-summary__action">
            <Link
              href={subscriptionState.phase === 'paused' ? '/dashboard/billing#auto-renewal' : '/dashboard/plans?intent=renew'}
              className={`${subscriptionExpired ? 'btn-primary' : 'btn-secondary'} group w-full justify-between min-[1360px]:min-w-44`}
            >
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {subscriptionState.phase === 'paused' ? 'Возобновить' : unlimitedDuration ? 'Сменить тариф' : 'Продлить'}
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
            value={unlimitedDuration ? 'Безлимит' : formatSubscriptionDaysLeft(subscriptionState.daysLeft ?? 0, subscriptionState.status === 'PAUSED' ? null : subscriptionState.status)}
          />
          <AccessMetric
            icon={<CalendarDays className="h-4 w-4" />}
            label={subscriptionExpired ? 'Завершилась' : 'Оплачено до'}
            value={expiresAtLabel}
          />
          {whitelistAddonActive && whitelistAddonExpireAtLabel ? (
            <AccessMetric
              icon={<Globe2 className="h-4 w-4" />}
              label="Белые списки до"
              value={whitelistAddonExpireAtLabel}
            />
          ) : null}
          <AccessMetric
            icon={<Gauge className="h-4 w-4" />}
            label="Трафик"
            value={subscriptionExpired
              ? '0 доступно'
              : `${formatTrafficForUser(u.trafficUsed)}${isUnlimited ? ' · безлимит' : ` из ${formatTrafficForUser(u.trafficLimit)}`}`}
          />
        </div>
      </section>

      {!subscriptionExpired && localSubscription?.plan && localSubscription.planId && !unlimitedDuration ? (
        <AutoRenewalCard
          planId={localSubscription.planId}
          planName={localSubscription.plan.name}
          planPriceKopecks={currentRenewalPrice(
            localSubscription.plan,
            localSubscription.deviceLimit ?? localSubscription.plan.deviceLimit,
            user.personalDiscountPercent
          )}
          planDurationDays={localSubscription.plan.durationDays}
          planDeviceLimit={localSubscription.deviceLimit ?? localSubscription.plan.deviceLimit}
          accessExpiresAt={u.expiresAt}
          initialState={autoRenewal ? {
            ...autoRenewal,
            paymentMethodSavedAt: autoRenewal.paymentMethodSavedAt?.toISOString() ?? null,
            consentAcceptedAt: autoRenewal.consentAcceptedAt?.toISOString() ?? null,
            nextChargeAt: autoRenewal.nextChargeAt?.toISOString() ?? null,
            lastAttemptAt: autoRenewal.lastAttemptAt?.toISOString() ?? null,
            lastSuccessAt: autoRenewal.lastSuccessAt?.toISOString() ?? null,
          } : null}
          initialPause={retentionPause ? {
            ...retentionPause,
            pauseUntil: retentionPause.pauseUntil?.toISOString() ?? null,
            createdAt: retentionPause.createdAt.toISOString(),
          } : null}
        />
      ) : null}

      <SubscriptionTimeline payments={payments} auditEvents={auditEvents} />
    </ConnectionPage>
  )
}

function formatTrafficForUser(value: string) {
  const match = value.trim().match(/^([\d.,]+)\s*(GiB|MiB|KiB|GB|MB|KB)$/i)
  if (!match) return value
  const amount = Number(match[1]!.replace(',', '.'))
  if (!Number.isFinite(amount)) return value
  const units: Record<string, string> = {
    gib: 'ГБ',
    gb: 'ГБ',
    mib: 'МБ',
    mb: 'МБ',
    kib: 'КБ',
    kb: 'КБ',
  }
  const unit = units[match[2]!.toLowerCase()]
  return unit ? `${amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${unit}` : value
}

function currentRenewalPrice(
  plan: {
    priceKopecks: number
    deviceLimit: number
    maxDeviceLimit: number
    extraDevicePriceKopecks: number
  },
  deviceLimit: number,
  personalDiscountPercent: number
) {
  return tryCalculateRenewalPricing(plan, deviceLimit, personalDiscountPercent)?.totalAmountKopecks
    ?? plan.priceKopecks
}

function SubscriptionUnavailable({
  supportEnabled,
  savedState,
  planName,
  lastSyncedAt,
}: {
  supportEnabled: boolean
  savedState: ReturnType<typeof resolveSubscriptionPresentation> | null
  planName: string | null
  lastSyncedAt: Date | null
}) {
  if (savedState) {
    return (
      <div className="page-stack mx-auto w-full max-w-2xl">
        <PageHeader title="Подключение" description="Сервис подключения временно не ответил." />
        <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 dark:border-amber-500/25 dark:bg-amber-500/[0.08]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-amber-950 dark:text-amber-100">{savedState.title}</h2>
            <StatusBadge status={savedState.status} />
          </div>
          <p className="mt-2 text-sm leading-6 text-amber-900/80 dark:text-amber-100/80">
            Показаны последние данные кабинета{planName ? ` по тарифу «${planName}»` : ''}
            {lastSyncedAt ? `, обновлённые ${lastSyncedAt.toLocaleString('ru-RU')}` : ''}. Настройки не изменены.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href="/dashboard/subscription" className="btn-primary">Проверить снова</Link>
            {supportEnabled && <Link href="/dashboard/support" className="btn-secondary">В поддержку</Link>}
          </div>
        </section>
      </div>
    )
  }
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
    if (payment.purchaseType === 'WHITELIST_ADDON') title = payment.status === 'REFUNDED' ? 'Белые списки отключены' : 'Белые списки подключены'
    else if (snapshot?.switchFromPlan) title = `Смена тарифа: ${snapshot.switchFromPlan.name} → ${snapshot.name}`
    else title = subscriptionPurchases === 0 ? `Тариф «${snapshot?.name ?? payment.plan.name}» подключён` : `Тариф «${snapshot?.name ?? payment.plan.name}» продлён`
    if (payment.purchaseType !== 'WHITELIST_ADDON') subscriptionPurchases += 1
    return { id: `payment-${payment.id}`, title, createdAt: payment.paidAt ?? payment.createdAt }
  })
  const items = [...paymentItems, ...auditEvents.map((event) => ({ id: `audit-${event.id}`, title: event.message, createdAt: event.createdAt }))]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 12)
  if (items.length === 0) return null
  const recentItems = items.slice(0, 3)
  const olderItems = items.slice(3)
  return (
    <details className="group relative overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-gradient-to-b from-violet-50/50 to-white p-4 shadow-[0_16px_42px_-30px_rgba(15,23,42,0.38)] dark:border-white/[0.09] dark:from-violet-400/[0.05] dark:to-white/[0.035] sm:p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="relative flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/15 dark:text-violet-300">
            <Clock3 className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-slate-950 dark:text-white">История подписки</span>
            <span className="block text-xs font-normal text-slate-400">Последние 3 действия</span>
          </span>
        </span>
        {olderItems.length > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors group-hover:text-slate-900 dark:group-hover:text-white">
            <span className="group-open:hidden">Показать все</span>
            <span className="hidden group-open:inline">Свернуть</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </span>
        ) : null}
      </summary>

      <div className="mt-4 grid gap-2.5 md:grid-cols-3">
        {recentItems.map((item) => <TimelineItem key={item.id} item={item} />)}
      </div>

      {olderItems.length > 0 ? (
        <div className="mt-2.5 hidden gap-2.5 border-t border-slate-200 pt-2.5 group-open:grid dark:border-white/[0.07] md:grid-cols-3">
          {olderItems.map((item) => <TimelineItem key={item.id} item={item} />)}
        </div>
      ) : null}
    </details>
  )
}

function TimelineItem({
  item,
}: {
  item: { id: string; title: string; createdAt: Date }
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-3 shadow-sm dark:border-white/[0.07] dark:bg-black/10">
      <div className="truncate text-sm font-medium text-slate-900 dark:text-white" title={item.title}>{item.title}</div>
      <div className="mt-1 text-xs text-slate-400">{item.createdAt.toLocaleString('ru-RU')}</div>
    </div>
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
    <div className="connection-access-summary__metric flex min-w-0 items-start gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/15 dark:text-emerald-300">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium uppercase tracking-[0.1em] text-slate-400">{label}</span>
        <strong className="mt-1 block break-words text-sm text-slate-950 dark:text-white">{value}</strong>
      </span>
    </div>
  )
}
