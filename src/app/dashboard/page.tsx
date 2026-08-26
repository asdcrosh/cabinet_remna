// Главная кабинета: состояние доступа и одно следующее действие.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CreditCard,
  KeyRound,
  MessageCircleQuestion,
  MonitorSmartphone,
  ShieldCheck,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError, type UserStatus } from '@/lib/remnawave'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { DashboardOnboardingCard, type DashboardOnboardingState } from '@/components/dashboard/onboarding-card'
import { logWarn } from '@/lib/logger'
import { formatSubscriptionDaysLeft, isSubscriptionExpired } from '@/lib/subscription-time'
import { getFreshPendingPaymentCutoff } from '@/lib/payment-sync'
import { getFeatureFlags } from '@/lib/feature-flags'
import { getAvailablePaymentProviders } from '@/lib/payment-providers'
import { cn } from '@/lib/cn'
import { HomeWhitelistAddon } from '@/components/dashboard/home-whitelist-addon'
import { HomeDeviceAddon } from '@/components/dashboard/home-device-addon'
import { isWhitelistAddonCurrentlyActive } from '@/lib/whitelist-addon-policy'

export const dynamic = 'force-dynamic'

export default async function DashboardHome() {
  const session = await getCurrentUser()
  if (!session) redirect('/login')

  const freshPendingCutoff = getFreshPendingPaymentCutoff()
  const [features, user, paymentProviders] = await Promise.all([
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
    getAvailablePaymentProviders(),
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
          <DashboardOnboardingCard
            state={onboardingState}
            mode="full"
            supportEnabled={features.support}
            focus="access"
          />
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
  const now = new Date()
  const graceActive = Boolean(subRow?.graceExpireAt && subRow.graceExpireAt > now)
  const effectiveExpireAt = graceActive ? subRow?.graceExpireAt ?? null : sub?.expiresAt ? new Date(sub.expiresAt) : subRow?.expireAt ?? null
  const localDaysLeft = effectiveExpireAt
    ? Math.ceil((effectiveExpireAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : 0
  const daysLeft = graceActive ? localDaysLeft : sub?.daysLeft ?? localDaysLeft
  const subscriptionStatus = (graceActive ? 'LIMITED' : sub?.userStatus ?? subRow?.status ?? 'DISABLED') as UserStatus
  const subscriptionExpired = isSubscriptionExpired(daysLeft, subscriptionStatus)
  const expiresAt = subRow?.expireAt ?? (sub?.expiresAt ? new Date(sub.expiresAt) : null)
  const expiresAtLabel = expiresAt?.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }) ?? null
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
  const whitelistAddonActive = Boolean(subRow && isWhitelistAddonCurrentlyActive(subRow))
  const whitelistAddonConfigured = Boolean(
    subRow?.plan?.whitelistAddonEnabled
    && subRow.plan.whitelistAddonPriceKopecks > 0
    && subRow.plan.whitelistAddonInternalSquads.length > 0
  )
  const whitelistAddonOffer = subRow
    && subRow.planId
    && subRow.plan
    && !subscriptionExpired
    && ['ACTIVE', 'LIMITED'].includes(subRow.status)
    && subRow.expireAt.getTime() > Date.now()
    && (whitelistAddonActive || whitelistAddonConfigured)
    ? {
        planId: subRow.planId,
        priceKopecks: subRow.plan.whitelistAddonPriceKopecks,
        active: whitelistAddonActive,
        expireAt: subRow.whitelistAddonExpireAt?.toISOString() ?? null,
      }
    : null
  const currentDeviceLimit = subRow?.deviceLimit ?? subRow?.plan?.deviceLimit ?? null
  const deviceAddonExpireAt = sub?.expiresAt ? new Date(sub.expiresAt) : subRow?.expireAt ?? null
  const deviceAddonOffer = subRow?.planId
    && subRow.plan
    && subRow.plan.deviceAddonEnabled
    && currentDeviceLimit
    && currentDeviceLimit < subRow.plan.maxDeviceLimit
    && subRow.plan.extraDevicePriceKopecks > 0
    && !subscriptionExpired
    && ['ACTIVE', 'LIMITED'].includes(subRow.status)
    && deviceAddonExpireAt
    && deviceAddonExpireAt.getTime() > Date.now()
    ? {
        planId: subRow.planId,
        currentLimit: currentDeviceLimit,
        maxLimit: subRow.plan.maxDeviceLimit,
        durationDays: subRow.plan.durationDays,
        extraDevicePriceKopecks: subRow.plan.extraDevicePriceKopecks,
        expireAt: deviceAddonExpireAt.toISOString(),
      }
    : null
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
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3.5 text-sm text-amber-900 shadow-sm dark:border-amber-500/25 dark:bg-amber-500/[0.08] dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
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
        className={cn('home-access-card', subscriptionExpired && 'home-access-card--expired')}
        data-testid="subscription-overview"
      >
        <div aria-hidden="true" className="home-access-card__orb home-access-card__orb--primary" />
        <div aria-hidden="true" className="home-access-card__orb home-access-card__orb--signal" />

        <div className="home-access-card__top">
          <div className="min-w-0">
            <div className="home-access-card__label">
              <span className={cn('home-access-card__pulse', subscriptionExpired && 'home-access-card__pulse--expired')} />
              Текущий доступ
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <h2 className="break-words text-xl font-semibold tracking-[-0.035em] text-slate-950 dark:text-white sm:text-2xl">
                {subRow?.plan?.name ?? 'VPN-подписка'}
              </h2>
              <StatusBadge status={subscriptionStatus} />
            </div>
          </div>
          <Link href={primaryAction.href} className="btn-primary home-access-card__action group hidden shrink-0 justify-between sm:inline-flex">
            <span className="inline-flex items-center gap-2">
              {primaryAction.icon}
              {primaryAction.label}
            </span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="home-access-card__body">
          <div className="home-access-card__remaining">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Осталось</div>
            <strong className="mt-2 block text-[3.4rem] font-semibold leading-none tracking-[-0.075em] text-slate-950 dark:text-white sm:text-[4.8rem]">
              {subRow || sub ? formatSubscriptionDaysLeft(daysLeft, subscriptionStatus) : 'Нет данных'}
            </strong>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              {graceActive
                ? `Льготный доступ до ${subRow?.graceExpireAt?.toLocaleString('ru-RU')}. Оплатите тариф, чтобы сохранить подключение.`
                : subscriptionExpired
                ? 'Профиль сохранён. Продлите доступ без повторной настройки.'
                : expiresAtLabel
                  ? `Оплачено до ${expiresAtLabel}`
                  : 'Доступ активен.'}
            </p>
            <Link href={primaryAction.href} className="btn-primary home-access-card__action group mt-5 w-full justify-between sm:hidden">
              <span className="inline-flex items-center gap-2">
                {primaryAction.icon}
                {primaryAction.label}
              </span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="home-access-card__facts">
            <div className="home-access-card__fact">
              <span className="home-access-card__fact-icon home-access-card__fact-icon--violet">
                <MonitorSmartphone className="h-5 w-5" />
              </span>
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Устройства</div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
                  {user._count.devices} подключено
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {currentDeviceLimit ? `Лимит до ${currentDeviceLimit}` : 'Без указанного лимита'}
                </div>
              </div>
            </div>
            <div className="home-access-card__fact">
              <span className="home-access-card__fact-icon home-access-card__fact-icon--cyan">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Период доступа</div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
                  {expiresAtLabel ?? 'Без даты'}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">Продлить можно в любой момент</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {whitelistAddonOffer ? (
        <HomeWhitelistAddon
          planId={whitelistAddonOffer.planId}
          priceKopecks={whitelistAddonOffer.priceKopecks}
          active={whitelistAddonOffer.active}
          expireAt={whitelistAddonOffer.expireAt}
          paymentProviders={paymentProviders}
        />
      ) : null}

      {deviceAddonOffer ? (
        <HomeDeviceAddon {...deviceAddonOffer} paymentProviders={paymentProviders} />
      ) : null}

      <HomeQuickActions supportEnabled={features.support} />
    </div>
  )
}

function HomeHeader({ name, description }: { name: string; description: string }) {
  return (
    <header className="home-hero">
      <div aria-hidden="true" className="home-hero__glow" />
      <div className="home-hero__content">
        <div className="min-w-0">
          <div className="page-eyebrow">Личный кабинет</div>
          <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.045em] text-slate-950 dark:text-white sm:text-[2.5rem]">
            Привет, {name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400 sm:text-base">
            {description}
          </p>
        </div>
        <div className="home-hero__mark" aria-hidden="true">
          <ShieldCheck className="h-7 w-7" />
        </div>
      </div>
    </header>
  )
}

function HomeQuickActions({ supportEnabled }: { supportEnabled: boolean }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4 px-1">
        <div>
          <div className="page-eyebrow">Навигация</div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Быстрый доступ</h2>
        </div>
        <span className="hidden text-xs text-slate-400 sm:block">Всё нужное под рукой</span>
      </div>
      <nav className={cn('home-action-grid', !supportEnabled && 'home-action-grid--two')} aria-label="Быстрые действия">
        <Link href="/dashboard/subscription" className="home-action-card home-action-card--connection group">
          <span className="home-action-card__icon">
            <KeyRound className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="home-action-card__eyebrow">Настройка</span>
            <span className="mt-1 block text-base font-semibold text-slate-950 dark:text-white">Подключение</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">INCY, ссылка и устройства</span>
          </span>
          <ArrowRight className="home-action-card__arrow" />
        </Link>
        <Link href="/dashboard/plans?intent=renew" className="home-action-card home-action-card--billing group">
          <span className="home-action-card__icon">
            <CreditCard className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="home-action-card__eyebrow">Подписка</span>
            <span className="mt-1 block text-base font-semibold text-slate-950 dark:text-white">Продлить доступ</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Выбрать подходящий срок</span>
          </span>
          <ArrowRight className="home-action-card__arrow" />
        </Link>
        {supportEnabled && (
          <Link href="/dashboard/support" className="home-action-card home-action-card--support group">
            <span className="home-action-card__icon">
              <MessageCircleQuestion className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="home-action-card__eyebrow">Помощь</span>
              <span className="mt-1 block text-base font-semibold text-slate-950 dark:text-white">Поддержка</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Вопросы по доступу и оплате</span>
            </span>
            <ArrowRight className="home-action-card__arrow" />
          </Link>
        )}
      </nav>
    </section>
  )
}

function PendingPaymentCard({
  payment,
}: {
  payment: { id: string; confirmationUrl: string | null; createdAt: Date }
}) {
  const href = payment.confirmationUrl || '/dashboard/billing'
  return (
    <section className="access-pass home-pending-card p-5 sm:p-6">
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

function dashboardDisplayName(name: string | null, email: string) {
  const value = name?.trim() || email.split('@')[0] || 'друг'
  return value.split(/\s+/)[0] ?? 'друг'
}
