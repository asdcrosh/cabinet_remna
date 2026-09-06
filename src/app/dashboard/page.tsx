// Главная кабинета: подписка, подключение и быстрые действия.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  LifeBuoy,
  CreditCard,
  Gift,
  KeyRound,
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
import styles from './home.module.css'
import { HomeWhitelistAddon } from '@/components/dashboard/home-whitelist-addon'
import { HomeDeviceAddon } from '@/components/dashboard/home-device-addon'
import {
  getWhitelistAddonRemainingSeconds,
  hasWhitelistAddonEntitlement,
  isWhitelistAddonCurrentlyActive,
} from '@/lib/whitelist-addon-policy'

export const dynamic = 'force-dynamic'

export default async function DashboardHome() {
  const session = await getCurrentUser()
  if (!session) redirect('/login')

  const freshPendingCutoff = getFreshPendingPaymentCutoff()
  const [features, user, paymentProviders, bonusAttempts] = await Promise.all([
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
    prisma.bonusBoxAttempt.count({
      where: {
        userId: session.uid,
        usedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
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
      <div className={cn('user-workspace', styles.page)}>
        <HomeHeader name={dashboardDisplayName(user.name, user.email)} />
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
        <HomeActions supportEnabled={features.support} hasSubscription={false} />
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
  const expiresAt = effectiveExpireAt
  const unlimitedDuration = Boolean(subRow?.plan?.unlimitedDuration)
  const expiresAtLabel = unlimitedDuration ? 'Бессрочно' : expiresAt?.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }) ?? null
  const primaryAction = subscriptionExpired || (!unlimitedDuration && daysLeft <= 7)
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
  const whitelistAddonRow = user.subscriptions.find((subscription) =>
    hasWhitelistAddonEntitlement(subscription, now)
  ) ?? subRow
  const whitelistAddonActive = Boolean(
    whitelistAddonRow && isWhitelistAddonCurrentlyActive(whitelistAddonRow, now)
  )
  const derivedPausedSeconds = whitelistAddonRow?.whitelistAddonActive && !whitelistAddonActive
    ? getWhitelistAddonRemainingSeconds(
        whitelistAddonRow.whitelistAddonExpireAt,
        whitelistAddonRow.whitelistAddonPausedAt
          ?? (whitelistAddonRow.expireAt < now ? whitelistAddonRow.expireAt : now)
      )
    : 0n
  const whitelistAddonPausedSeconds = whitelistAddonRow?.whitelistAddonRemainingSeconds
    && whitelistAddonRow.whitelistAddonRemainingSeconds > 0n
    ? whitelistAddonRow.whitelistAddonRemainingSeconds
    : derivedPausedSeconds
  const whitelistAddonConfigured = Boolean(
    whitelistAddonRow?.plan?.whitelistAddonEnabled
    && whitelistAddonRow.plan.whitelistAddonPriceKopecks > 0
    && whitelistAddonRow.plan.whitelistAddonInternalSquads.length > 0
  )
  const whitelistAddonPaused = whitelistAddonPausedSeconds > 0n
  const canBuyWhitelistAddon = Boolean(
    whitelistAddonRow
    && !subscriptionExpired
    && ['ACTIVE', 'LIMITED'].includes(subscriptionStatus)
    && effectiveExpireAt
    && effectiveExpireAt > now
  )
  const whitelistAddonOffer = whitelistAddonRow
    && whitelistAddonRow.planId
    && whitelistAddonRow.plan
    && (whitelistAddonPaused || canBuyWhitelistAddon)
    && (whitelistAddonActive || whitelistAddonPaused || whitelistAddonConfigured)
    ? {
        planId: whitelistAddonRow.planId,
        priceKopecks: whitelistAddonRow.plan.whitelistAddonPriceKopecks,
        active: whitelistAddonActive,
        expireAt: whitelistAddonRow.whitelistAddonExpireAt?.toISOString() ?? null,
        pausedRemainingSeconds: whitelistAddonPaused
          ? Number(whitelistAddonPausedSeconds)
          : undefined,
      }
    : null
  const currentDeviceLimit = subRow?.deviceLimit ?? subRow?.plan?.deviceLimit ?? null
  const deviceAddonExpireAt = sub?.expiresAt ? new Date(sub.expiresAt) : subRow?.expireAt ?? null
  const deviceAddonOffer = subRow?.planId
    && subRow.plan
    && subRow.plan.deviceAddonEnabled
    && !subRow.plan.unlimitedDevices
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
    <div className={cn('user-workspace', styles.page)}>
      <HomeHeader name={dashboardDisplayName(user.name, user.email)} />

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

      <div className={styles.overview}>
        <section
          className={cn(styles.access, subscriptionExpired && styles.expired)}
          data-testid="subscription-overview"
        >
          <div className={styles.accessTop}>
            <span className={styles.eyebrow}>Ваша подписка</span>
            <StatusBadge status={subscriptionStatus} />
          </div>
          <div className={styles.accessContent}>
            <h2 className={styles.planName}>{subRow?.plan?.name ?? 'VPN-подписка'}</h2>
            <div className={styles.remainingLabel}>{unlimitedDuration ? 'Доступ' : 'Осталось'}</div>
            <strong className={cn(styles.remaining, unlimitedDuration && styles.remainingUnlimited)}>
              {unlimitedDuration
                ? 'Бессрочно'
                : subRow || sub
                  ? formatSubscriptionDaysLeft(daysLeft, subscriptionStatus)
                  : 'Нет данных'}
            </strong>
            <p className={styles.accessDescription}>
              {graceActive
                ? `Льготный доступ до ${subRow?.graceExpireAt?.toLocaleString('ru-RU')}. Оплатите тариф, чтобы сохранить подключение.`
                : subscriptionExpired
                  ? 'Продлите подписку и продолжайте пользоваться привычным подключением.'
                  : unlimitedDuration
                    ? 'Продление не требуется. Подключайте свои устройства и пользуйтесь VPN.'
                    : expiresAtLabel
                      ? `Оплачено до ${expiresAtLabel}`
                      : 'Срок подписки пока недоступен.'}
            </p>
          </div>
          <div className={styles.accessBottom}>
            <Link href={primaryAction.href} className={styles.primaryAction}>
              {primaryAction.icon}
              <span>{primaryAction.label}</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
            <span className={styles.accessNote}>Одна подписка для ваших устройств</span>
          </div>
          <div className={styles.orbit} aria-hidden="true">
            <div className={styles.orbitMiddle}><div className={styles.orbitCore}><ShieldCheck /></div></div>
          </div>
        </section>

        <div className={styles.metrics}>
          <Link href="/dashboard/devices" className={styles.metric}>
            <div className={styles.metricTop}>
              <span className={styles.metricIcon}><MonitorSmartphone className="h-5 w-5" /></span>
              <ArrowRight className="h-4 w-4" />
            </div>
            <span className={styles.metricLabel}>Мои устройства</span>
            <strong className={styles.metricValue}>
              {user._count.devices}
              <span>{subRow?.plan?.unlimitedDevices ? ' / ∞' : currentDeviceLimit ? ` / ${currentDeviceLimit}` : ' подключено'}</span>
            </strong>
            <span className={styles.metricHint}>Посмотреть и управлять</span>
          </Link>
          <Link href="/dashboard/billing#auto-renewal" className={styles.metric}>
            <div className={styles.metricTop}>
              <span className={styles.metricIcon}><CalendarDays className="h-5 w-5" /></span>
              <ArrowRight className="h-4 w-4" />
            </div>
            <span className={styles.metricLabel}>{unlimitedDuration ? 'Срок подписки' : 'Оплачено до'}</span>
            <strong className={styles.metricDate}>{expiresAtLabel ?? 'Нет данных'}</strong>
            <span className={styles.metricHint}>Автопродление и платежи</span>
          </Link>
        </div>
      </div>

      {user.payments[0] ? <PendingPaymentCard payment={user.payments[0]} /> : null}

      <HomeActions supportEnabled={features.support} hasSubscription />

      {((features.bonusBox && bonusAttempts > 0) || whitelistAddonOffer || deviceAddonOffer) ? (
        <section className={styles.extras} aria-label="Дополнительные возможности">
          <div className={styles.sectionHeading}>
            <h2>Больше возможностей</h2>
            <p>Дополнения и бонусы к вашей подписке</p>
          </div>
          {features.bonusBox && bonusAttempts > 0 ? (
            <Link
              href="/dashboard/bonus-box"
              className="group flex min-h-16 items-center gap-3 rounded-2xl border border-fuchsia-200/80 bg-fuchsia-50/70 px-4 py-3 text-slate-800 transition hover:border-fuchsia-300 hover:bg-fuchsia-50 dark:border-fuchsia-400/15 dark:bg-fuchsia-400/[0.06] dark:text-slate-100 dark:hover:bg-fuchsia-400/[0.1]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-200">
                <Gift className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Доступны подарки</span>
                <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">
                  {bonusAttempts} {bonusAttemptLabel(bonusAttempts)} можно использовать сейчас
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : null}

          {whitelistAddonOffer ? (
            <HomeWhitelistAddon
              planId={whitelistAddonOffer.planId}
              priceKopecks={whitelistAddonOffer.priceKopecks}
              active={whitelistAddonOffer.active}
              expireAt={whitelistAddonOffer.expireAt}
              pausedRemainingSeconds={whitelistAddonOffer.pausedRemainingSeconds}
              paymentProviders={paymentProviders}
            />
          ) : null}

          {deviceAddonOffer ? (
            <HomeDeviceAddon {...deviceAddonOffer} paymentProviders={paymentProviders} />
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function bonusAttemptLabel(count: number) {
  const lastTwo = count % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'попыток'
  const last = count % 10
  if (last === 1) return 'попытку'
  if (last >= 2 && last <= 4) return 'попытки'
  return 'попыток'
}

function HomeHeader({ name }: { name: string }) {
  return (
    <header className={styles.header}>
      <h1>Привет, {name}</h1>
    </header>
  )
}

function HomeActions({ supportEnabled, hasSubscription }: { supportEnabled: boolean; hasSubscription: boolean }) {
  const actions = [
    {
      href: hasSubscription ? '/dashboard/subscription' : '/dashboard/plans',
      title: hasSubscription ? 'Подключить VPN' : 'Выбрать подписку',
      description: hasSubscription ? 'Приложение и инструкция для вашего устройства' : 'Тарифы, сроки и количество устройств',
      icon: KeyRound,
    },
    {
      href: '/dashboard/billing',
      title: 'Подписка и оплата',
      description: 'История платежей и управление автопродлением',
      icon: CreditCard,
    },
    ...(supportEnabled ? [{
      href: '/dashboard/support',
      title: 'Нужна помощь?',
      description: 'Обратитесь в поддержку, если что-то не получается',
      icon: LifeBuoy,
    }] : []),
  ]
  return (
    <section aria-label="Быстрые действия" className={styles.actionsSection}>
      <div className={styles.sectionHeading}><h2>Всегда под рукой</h2></div>
      <div className={styles.actions}>
        {actions.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className={styles.action}>
            <span className={styles.actionIcon}><Icon className="h-5 w-5" /></span>
            <span className={styles.actionText}><strong>{title}</strong><span>{description}</span></span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </Link>
        ))}
      </div>
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
