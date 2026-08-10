// Главная кабинета: состояние доступа и одно следующее действие.

import Link from 'next/link'
import type { ReactElement } from 'react'
import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CreditCard,
  KeyRound,
  Laptop,
  MessageCircleQuestion,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError, type UserStatus } from '@/lib/remnawave'
import { formatBytes } from '@/lib/format'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { TrafficChart } from '@/components/dashboard/traffic-chart'
import { DashboardOnboardingCard, type DashboardOnboardingState } from '@/components/dashboard/onboarding-card'
import { logWarn } from '@/lib/logger'
import { formatSubscriptionDaysLeft, isSubscriptionExpired } from '@/lib/subscription-time'
import { readRemnawaveBigInt } from '@/lib/remnawave-usage'
import { getFreshPendingPaymentCutoff } from '@/lib/payment-sync'
import { getFeatureFlags } from '@/lib/feature-flags'
import { cn } from '@/lib/cn'

export const dynamic = 'force-dynamic'

export default async function DashboardHome() {
  const session = await getCurrentUser()
  if (!session) redirect('/login')

  const freshPendingCutoff = getFreshPendingPaymentCutoff()
  const [features, user] = await Promise.all([
    getFeatureFlags(),
    prisma.user.findUnique({
      where: { id: session.uid },
      include: {
        subscriptions: { orderBy: { expireAt: 'desc' }, take: 5, include: { plan: true } },
        payments: {
          where: { status: 'PENDING', createdAt: { gt: freshPendingCutoff } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, confirmationUrl: true, createdAt: true },
        },
        _count: { select: { devices: true } },
      },
    }),
  ])
  if (!user) {
    logWarn('auth.dashboard.stale_session_redirect', { userId: session.uid })
    redirect('/login?next=/dashboard')
  }

  const subRow = user.subscriptions[0] ?? null
  const onboardingState: DashboardOnboardingState = {
    emailVerified: Boolean(user.emailVerifiedAt && !user.email.endsWith('@pending.invalid')),
    telegramLinked: Boolean(user.telegramId),
    remnashopSynced: Boolean(user.remnashopSyncedAt),
    hasLocalSubscription: Boolean(subRow),
    hasRemnawaveProfile: Boolean(user.remnawaveUsername),
    pendingSync: Boolean(subRow?.pendingSync),
    deviceCount: user._count.devices,
  }

  if (!user.remnawaveUsername) {
    return (
      <div className="user-workspace page-stack">
        <HomeHeader
          name={dashboardDisplayName(user.name, user.email)}
          description={user.payments[0]
            ? 'Оплата ещё не завершена. Продолжите с того же места.'
            : 'До первого подключения остался один шаг.'}
        />
        {user.payments[0] ? (
          <PendingPaymentCard payment={user.payments[0]} />
        ) : (
          <DashboardOnboardingCard state={onboardingState} mode="full" supportEnabled={features.support} />
        )}
      </div>
    )
  }

  const remnawaveCardResult = await remnawave.getSubscriptionByUsername(user.remnawaveUsername)
    .then((data) => ({ data, errorStatus: null as number | null }))
    .catch((error) => {
      if (error instanceof RemnawaveError) return { data: null, errorStatus: error.status }
      throw error
    })
  const remnawaveCard = remnawaveCardResult.data
  const remnawaveErrorStatus = remnawaveCardResult.errorStatus
  const sub = remnawaveCard?.response.user
  const hasRemoteUsage = Boolean(sub)
  const used = sub ? readRemnawaveBigInt(sub, ['trafficUsedBytes', 'usedTrafficBytes']) : 0n
  const limit = sub ? readRemnawaveBigInt(sub, ['trafficLimitBytes', 'trafficLimit']) : 0n
  const isUnlimited = hasRemoteUsage && limit === 0n
  const localDaysLeft = subRow
    ? Math.ceil((subRow.expireAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : 0
  const daysLeft = sub?.daysLeft ?? localDaysLeft
  const subscriptionStatus = (sub?.userStatus ?? subRow?.status ?? 'DISABLED') as UserStatus
  const subscriptionExpired = isSubscriptionExpired(daysLeft, subscriptionStatus)
  const expiresAt = sub?.expiresAt ? new Date(sub.expiresAt) : subRow?.expireAt ?? null
  const expiresAtLabel = expiresAt?.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }) ?? null
  const trafficPercent = getTrafficPercent(used, limit, isUnlimited)
  const primaryAction = subscriptionExpired || daysLeft <= 7
    ? {
        href: '/dashboard/plans?intent=renew',
        label: subscriptionExpired ? 'Возобновить доступ' : 'Продлить подписку',
        icon: <CreditCard className="h-4 w-4" />,
      }
    : user._count.devices === 0
      ? {
          href: '/dashboard/subscription',
          label: 'Подключить устройство',
          icon: <KeyRound className="h-4 w-4" />,
        }
      : {
          href: '/dashboard/subscription',
          label: 'Управлять подключением',
          icon: <KeyRound className="h-4 w-4" />,
        }
  const primaryHomeNudge = getPrimaryHomeNudge(onboardingState)

  return (
    <div className="user-workspace page-stack">
      <HomeHeader
        name={dashboardDisplayName(user.name, user.email)}
        description={subscriptionExpired
          ? 'Доступ остановлен, профиль сохранён и готов к повторной активации.'
          : user._count.devices === 0
            ? 'Подписка готова. Теперь подключите первое устройство.'
            : 'Подписка работает. Здесь только актуальное состояние.'}
      />

      {remnawaveErrorStatus !== null && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-medium">
                {remnawaveErrorStatus === 404 ? 'Профиль доступа не найден' : 'Данные обновляются с задержкой'}
              </div>
              <div className="mt-1 opacity-80">
                {remnawaveErrorStatus === 404
                  ? 'Локальная подписка сохранена. Если повторная загрузка не поможет, обратитесь в поддержку.'
                  : 'Срок показан по данным кабинета, трафик временно недоступен.'}
              </div>
            </div>
          </div>
          <Link href="/dashboard" className="btn-secondary w-full shrink-0 justify-center sm:w-auto">
            Обновить
          </Link>
        </div>
      )}

      <section
        className={cn('access-pass access-overview', subscriptionExpired && 'access-pass--expired')}
        data-testid="subscription-overview"
      >
        <div className="access-overview__top">
          <div className="min-w-0">
            <div className="access-overview__label">Текущий доступ</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              <h2 className="break-words text-lg font-semibold tracking-[-0.03em] text-slate-950 dark:text-white sm:text-xl">
                {subRow?.plan?.name ?? 'VPN-подписка'}
              </h2>
              <StatusBadge status={subscriptionStatus} />
            </div>
          </div>
          <Link href={primaryAction.href} className="btn-primary group hidden shrink-0 justify-between sm:inline-flex">
            <span className="inline-flex items-center gap-2">
              {primaryAction.icon}
              {primaryAction.label}
            </span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="access-overview__body">
          <div className="access-overview__remaining">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Осталось</div>
            <strong className="mt-2 block text-[3rem] font-semibold leading-none tracking-[-0.07em] text-slate-950 dark:text-white sm:text-[4.4rem]">
              {subRow || sub ? formatSubscriptionDaysLeft(daysLeft, subscriptionStatus) : 'Нет данных'}
            </strong>
            <p className="mt-3 text-sm leading-5 text-slate-500 dark:text-slate-400">
              {subscriptionExpired
                ? 'Профиль сохранён. Продлите доступ без повторной настройки.'
                : expiresAtLabel
                  ? `Оплачено до ${expiresAtLabel}`
                  : 'Доступ активен.'}
            </p>
          </div>

          <div className="access-overview__facts">
            <HomeMetric
              label="Трафик"
              value={subscriptionExpired
                ? 'Недоступен'
                : hasRemoteUsage
                  ? isUnlimited
                    ? `${formatBytes(used)} использовано`
                    : `${formatBytes(used)} из ${formatBytes(limit)}`
                  : 'Обновляется'}
              note={subscriptionExpired ? 'до продления' : isUnlimited ? 'без ограничений' : 'за текущий период'}
            />
            <HomeMetric
              label="Устройства"
              value={user._count.devices > 0 ? `${user._count.devices} подключено` : 'Не подключены'}
              note={user._count.devices > 0 ? 'можно управлять' : 'добавьте первое устройство'}
            />
          </div>
        </div>

        <div className="access-overview__bottom">
          <div className="min-w-0 flex-1">
            <div className="access-overview__progress">
              <div
                className={cn(
                  'access-overview__progress-value',
                  subscriptionExpired && 'access-overview__progress-value--expired'
                )}
                style={{ width: subscriptionExpired ? '0%' : isUnlimited ? '100%' : `${trafficPercent ?? 0}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>{subscriptionExpired ? 'Доступ остановлен' : isUnlimited ? 'Трафик без лимита' : 'Использование трафика'}</span>
              {!subscriptionExpired && !isUnlimited && trafficPercent != null && <span>{trafficPercent}%</span>}
            </div>
          </div>
          <Link href={primaryAction.href} className="btn-primary group w-full justify-between sm:hidden">
            <span className="inline-flex items-center gap-2">
              {primaryAction.icon}
              {primaryAction.label}
            </span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      <HomeQuickActions supportEnabled={features.support} />

      <SmartInsights
        emailVerified={onboardingState.emailVerified}
        telegramLinked={onboardingState.telegramLinked}
        deviceCount={onboardingState.deviceCount}
        pendingPayment={user.payments[0] ?? null}
        suppress={primaryHomeNudge}
      />

      {hasRemoteUsage && (
        <details className="group border-t border-slate-200 pt-3 dark:border-white/10">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white [&::-webkit-details-marker]:hidden">
            <span>Расход трафика</span>
            <span className="text-xs text-slate-400 group-open:hidden">Показать график</span>
            <span className="hidden text-xs text-slate-400 group-open:inline">Скрыть</span>
          </summary>
          <div className="pt-3">
            <TrafficChart
              userId={user.id}
              initialUsedBytes={used.toString()}
              initialLimitBytes={isUnlimited ? null : limit.toString()}
            />
          </div>
        </details>
      )}
    </div>
  )
}

function HomeHeader({ name, description }: { name: string; description: string }) {
  return (
    <header className="home-intro pb-1">
      <div className="page-eyebrow">Личный кабинет</div>
      <h1 className="text-[1.8rem] font-semibold leading-tight tracking-[-0.04em] text-slate-950 dark:text-white sm:text-[2rem]">
        Привет, {name}
      </h1>
      <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </header>
  )
}

function HomeQuickActions({ supportEnabled }: { supportEnabled: boolean }) {
  return (
    <nav className={cn('home-quick-actions', !supportEnabled && 'home-quick-actions--two')} aria-label="Быстрые действия">
      <Link href="/dashboard/subscription" className="home-quick-actions__item group">
        <span className="home-quick-actions__icon">
          <KeyRound className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-950 dark:text-white">Подключение</span>
          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">INCY, ссылка и устройства</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-950 dark:group-hover:text-white" />
      </Link>
      <Link href="/dashboard/plans" className="home-quick-actions__item group">
        <span className="home-quick-actions__icon">
          <CreditCard className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-950 dark:text-white">Тарифы</span>
          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">Продлить или сменить срок</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-950 dark:group-hover:text-white" />
      </Link>
      {supportEnabled && (
        <Link href="/dashboard/support" className="home-quick-actions__item group">
          <span className="home-quick-actions__icon">
            <MessageCircleQuestion className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-950 dark:text-white">Поддержка</span>
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">Вопросы по доступу и оплате</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-950 dark:group-hover:text-white" />
        </Link>
      )}
    </nav>
  )
}

function HomeMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="access-overview__fact">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-2 break-words text-base font-semibold tracking-[-0.02em] text-slate-950 dark:text-white sm:text-lg">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</div>
    </div>
  )
}

function PendingPaymentCard({
  payment,
}: {
  payment: { id: string; confirmationUrl: string | null; createdAt: Date }
}) {
  const href = payment.confirmationUrl || '/dashboard/billing'
  return (
    <section className="access-pass p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-200">
            Оплата не завершена
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Продолжить оформление
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Тариф уже выбран. После оплаты доступ появится автоматически.
          </p>
        </div>
        <Link
          href={href}
          target={payment.confirmationUrl ? '_blank' : undefined}
          rel={payment.confirmationUrl ? 'noreferrer' : undefined}
          className="btn-primary w-full shrink-0 justify-between sm:w-auto"
        >
          Продолжить оплату
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}

type HomeNudgeKey = 'subscription' | 'device' | 'email' | 'telegram' | 'sync' | null

function getPrimaryHomeNudge(state: DashboardOnboardingState): HomeNudgeKey {
  if (state.pendingSync && !state.hasRemnawaveProfile) return 'sync'
  if (!state.hasLocalSubscription && !state.hasRemnawaveProfile) return 'subscription'
  if (state.hasRemnawaveProfile && state.deviceCount === 0) return 'device'
  if (!state.emailVerified) return 'email'
  if (!state.telegramLinked) return 'telegram'
  if (state.telegramLinked && !state.remnashopSynced) return 'sync'
  return null
}

function SmartInsights({
  emailVerified,
  telegramLinked,
  deviceCount,
  pendingPayment,
  suppress = null,
}: {
  emailVerified: boolean
  telegramLinked: boolean
  deviceCount: number
  pendingPayment: { id: string; confirmationUrl: string | null; createdAt: Date } | null
  suppress?: HomeNudgeKey
}) {
  const items = [
    pendingPayment
      ? {
          title: 'Есть незавершённая оплата',
          text: 'Продолжите оплату или откройте историю платежей.',
          href: pendingPayment.confirmationUrl || '/dashboard/billing',
          external: Boolean(pendingPayment.confirmationUrl),
          icon: <CreditCard className="h-4 w-4" />,
          tone: 'amber' as const,
        }
      : null,
    suppress !== 'device' && deviceCount === 0
      ? {
          title: 'Устройство ещё не подключено',
          text: 'Добавьте подписку в приложение и включите VPN.',
          href: '/dashboard/subscription',
          icon: <Laptop className="h-4 w-4" />,
          tone: 'cyan' as const,
        }
      : null,
    suppress !== 'email' && !emailVerified
      ? {
          title: 'Подтвердите email',
          text: 'Он понадобится для восстановления доступа.',
          href: '/dashboard/settings',
          icon: <Bell className="h-4 w-4" />,
          tone: 'slate' as const,
        }
      : null,
    suppress !== 'telegram' && !telegramLinked
      ? {
          title: 'Привяжите Telegram',
          text: 'Кабинет сможет найти старые покупки и присылать важные уведомления.',
          href: '/dashboard/settings',
          icon: <MessageCircleQuestion className="h-4 w-4" />,
          tone: 'slate' as const,
        }
      : null,
  ].filter(Boolean).slice(0, 1) as Array<{
    title: string
    text: string
    href: string
    external?: boolean
    icon: ReactElement
    tone: 'amber' | 'cyan' | 'slate'
  }>

  if (items.length === 0) return null

  return (
    <section>
      {items.map((item) => (
        <Link
          key={item.title}
          href={item.href}
          target={item.external ? '_blank' : undefined}
          rel={item.external ? 'noreferrer' : undefined}
          className={cn(
            'group flex min-h-16 items-center gap-3 border-y px-1 py-3 transition-colors',
            insightTone(item.tone)
          )}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/70 text-current ring-1 ring-black/[0.04] dark:bg-white/[0.06] dark:ring-white/10">
            {item.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-950 dark:text-white">{item.title}</span>
            <span className="mt-0.5 block text-xs leading-5 opacity-80">{item.text}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </section>
  )
}

function insightTone(tone: 'amber' | 'cyan' | 'slate') {
  if (tone === 'amber') return 'border-amber-200 text-amber-800 dark:border-amber-500/25 dark:text-amber-100'
  if (tone === 'cyan') return 'border-cyan-200 text-cyan-800 dark:border-cyan-500/25 dark:text-cyan-100'
  return 'border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300'
}

function getTrafficPercent(used: bigint, limit: bigint, unlimited: boolean) {
  if (unlimited || limit <= 0n) return null
  return Math.min(100, Math.max(0, Number((used * 100n) / limit)))
}

function dashboardDisplayName(name: string | null, email: string) {
  const value = name?.trim() || email.split('@')[0] || 'друг'
  return value.split(/\s+/)[0] ?? 'друг'
}
