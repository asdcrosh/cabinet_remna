// Главная страница кабинета: компактный обзор подписки и быстрые действия.

import Link from 'next/link'
import type { ReactElement } from 'react'
import { Prisma, type PersonalOfferScenario, type PersonalOfferSetting, type WelcomeBonusType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError } from '@/lib/remnawave'
import { formatBytes, formatPrice } from '@/lib/format'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { TrafficChart } from '@/components/dashboard/traffic-chart'
import { DashboardOnboardingCard, type DashboardOnboardingState } from '@/components/dashboard/onboarding-card'
import { WelcomeOfferButton } from '@/components/dashboard/welcome-offer-button'
import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Clock3,
  CreditCard,
  Gift,
  KeyRound,
  Laptop,
  MessageCircleQuestion,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { logWarn } from '@/lib/logger'
import { readRemnawaveBigInt } from '@/lib/remnawave-usage'
import { getFreshPendingPaymentCutoff } from '@/lib/payment-sync'
import { getPlanAudienceContext, isPlanAvailableForUser } from '@/lib/plan-access'
import { normalizeOfferTone, renderPersonalOfferTemplate } from '@/lib/personal-offers'
import { getFeatureFlags } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

const OFFER_RENEWAL_DAYS_LEFT = 7
const OFFER_RETURN_PROMO_DAYS = 45

export default async function DashboardHome() {
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const features = getFeatureFlags()
  const freshPendingCutoff = getFreshPendingPaymentCutoff()
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    include: {
      subscriptions: { orderBy: { expireAt: 'desc' }, take: 5, include: { plan: true } },
      payments: {
        where: { status: 'PENDING', createdAt: { gt: freshPendingCutoff } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, confirmationUrl: true, createdAt: true },
      },
      trialPlanRedemptions: { select: { id: true }, take: 1 },
      welcomeBonusRedemptions: { select: { id: true }, take: 1 },
      _count: { select: { devices: true } },
    },
  })
  if (!user) {
    logWarn('auth.dashboard.stale_session_redirect', { userId: session.uid })
    redirect('/login?next=/dashboard')
  }

  const subRow = user.subscriptions[0] ?? null
  const activeSubRow = user.subscriptions.find((subscription) =>
    ['ACTIVE', 'LIMITED'].includes(subscription.status) && subscription.expireAt > new Date()
  ) ?? null
  const remnawaveCardPromise = user.remnawaveUsername
    ? remnawave.getSubscriptionByUsername(user.remnawaveUsername).catch((error) => {
        if (error instanceof RemnawaveError) return null
        throw error
      })
    : Promise.resolve(null)
  const [
    remnawaveCard,
    audienceContext,
    availablePlans,
    lastSucceededPayment,
    promoOfferCode,
    offerSettings,
    welcomeBonusSetting,
  ] = await Promise.all([
    remnawaveCardPromise,
    getPlanAudienceContext(user.id),
    prisma.plan.findMany({
      where: { isActive: true, isPromo: false },
      orderBy: [{ sortOrder: 'asc' }, { priceKopecks: 'asc' }],
    }),
    prisma.payment.findFirst({
      where: { userId: user.id, status: 'SUCCEEDED' },
      orderBy: { paidAt: 'desc' },
      select: { paidAt: true, createdAt: true },
    }),
    findDashboardPromoCode(user.id, user.email),
    prisma.personalOfferSetting.findMany({
      where: { enabled: true },
      orderBy: [{ priority: 'asc' }, { scenario: 'asc' }],
      include: {
        promoCode: { select: { id: true, code: true, discountPercent: true, isActive: true } },
      },
    }),
    prisma.welcomeBonusSetting.findUnique({
      where: { id: 'default' },
      include: {
        trialPlan: { select: { id: true, name: true, durationDays: true, isActive: true, isPromo: true } },
        promoCode: { select: { id: true, code: true, discountPercent: true, isActive: true } },
      },
    }),
  ])
  const sub = remnawaveCard?.response.user
  const welcomeBonusOptions = buildWelcomeBonusOptions(welcomeBonusSetting, {
    trialUsed: user.trialPlanRedemptions.length > 0,
    bonusBoxEnabled: features.bonusBox,
  })
  const welcomeBonusEligible = isWelcomeBonusEligible({
    activeSubscription: activeSubRow,
    user: {
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      telegramId: user.telegramId,
      remnawaveUuid: user.remnawaveUuid,
      successfulPayments: Boolean(lastSucceededPayment),
      trialUsed: user.trialPlanRedemptions.length > 0,
      welcomeUsed: user.welcomeBonusRedemptions.length > 0,
    },
  })
  const visiblePaidPlans = audienceContext
    ? availablePlans.filter((plan) => isPlanAvailableForUser(plan, audienceContext))
    : availablePlans.filter((plan) => plan.availability === 'ALL')
  const onboardingState: DashboardOnboardingState = {
    emailVerified: Boolean(user.emailVerifiedAt && !user.email.endsWith('@pending.invalid')),
    telegramLinked: Boolean(user.telegramId),
    remnashopSynced: Boolean(user.remnashopSyncedAt),
    hasLocalSubscription: Boolean(subRow),
    hasRemnawaveProfile: Boolean(user.remnawaveUsername),
    pendingSync: Boolean(subRow?.pendingSync),
    deviceCount: user._count.devices,
  }
  const primaryHomeNudge = getPrimaryHomeNudge(onboardingState)
  const personalOffer = filterDuplicateHomeOffer(buildPersonalOffer({
    activeSubscription: activeSubRow,
    bestPlan: visiblePaidPlans[0] ?? null,
    deviceCount: user._count.devices,
    lastSucceededPaymentAt: lastSucceededPayment?.paidAt ?? lastSucceededPayment?.createdAt ?? null,
    promoCode: promoOfferCode,
    offerSettings,
    welcomeBonusAvailable: welcomeBonusEligible && welcomeBonusOptions.length > 0,
    referralsEnabled: features.referrals,
    user: { name: user.name, email: user.email },
  }), onboardingState)

  if (!user.remnawaveUsername) {
    return (
      <div className="page-stack">
        <DashboardOnboardingCard state={onboardingState} mode="full" supportEnabled={features.support} />
        {personalOffer && <PersonalOffer offer={personalOffer} welcomeBonusOptions={welcomeBonusOptions} />}
        <SmartInsights
          emailVerified={onboardingState.emailVerified}
          telegramLinked={onboardingState.telegramLinked}
          deviceCount={onboardingState.deviceCount}
          subscriptionExpireAt={subRow?.expireAt ?? null}
          pendingPayment={user.payments[0] ?? null}
          suppress={primaryHomeNudge}
        />
      </div>
    )
  }

  const used = sub ? readRemnawaveBigInt(sub, ['trafficUsedBytes', 'usedTrafficBytes']) : 0n
  const limit = sub ? readRemnawaveBigInt(sub, ['trafficLimitBytes', 'trafficLimit']) : 0n
  const isUnlimited = limit === 0n
  const percent = isUnlimited ? 0 : Math.min(100, Math.round((Number(used) / Number(limit || 1n)) * 100))
  const daysLeft = sub?.daysLeft ?? 0
  const primaryAction = daysLeft <= 7
    ? { href: '/dashboard/plans?intent=renew', label: 'Продлить подписку', icon: <CreditCard className="h-4 w-4" /> }
    : user._count.devices === 0
      ? { href: '/dashboard/subscription', label: 'Подключить устройство', icon: <KeyRound className="h-4 w-4" /> }
      : { href: '/dashboard/subscription', label: 'Открыть подписку', icon: <KeyRound className="h-4 w-4" /> }

  return (
    <div className="page-stack">
      {subRow?.pendingSync && !remnawaveCard && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-medium">Профиль доступа не найден в Remnawave</div>
            <div className="mt-1 opacity-80">
              Подписка сохранена в кабинете, но профиль нужно восстановить или перевыдать.
            </div>
          </div>
        </div>
      )}

      <section className="relative overflow-hidden rounded-lg border border-slate-200 bg-white/90 p-4 shadow-xl shadow-slate-950/[0.06] dark:border-white/10 dark:bg-surface-900 dark:shadow-black/25 sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-500" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-stretch">
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-300">Ваш VPN</div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-semibold leading-tight text-slate-950 dark:text-white sm:text-3xl">
                    {subRow?.plan?.name ?? 'VPN-подписка'}
                  </h1>
                  <StatusBadge status={sub?.userStatus ?? 'DISABLED'} />
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {subRow?.plan
                    ? `${formatPrice(subRow.plan.priceKopecks)} · ${subRow.plan.durationDays} дн.`
                    : 'Тариф синхронизируется'}
                </p>
              </div>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 py-4 dark:divide-white/10 dark:border-white/10">
              <OverviewMetric label="Осталось" value={sub ? `${daysLeft} дн.` : '—'} />
              <OverviewMetric label="Использовано" value={formatBytes(used)} />
              <OverviewMetric label="Лимит" value={isUnlimited ? 'Безлимит' : formatBytes(limit)} />
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <Link href="/dashboard/devices" className="font-medium text-slate-600 hover:text-cyan-700 dark:text-slate-300 dark:hover:text-cyan-200">Устройства</Link>
              <Link href="/dashboard/billing" className="font-medium text-slate-600 hover:text-cyan-700 dark:text-slate-300 dark:hover:text-cyan-200">Платежи</Link>
              {features.support && <Link href="/dashboard/support" className="font-medium text-slate-600 hover:text-cyan-700 dark:text-slate-300 dark:hover:text-cyan-200">Поддержка</Link>}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50/80 p-4 text-center dark:border-white/10 dark:bg-white/[0.035]">
            <UsageRing percent={percent} unlimited={isUnlimited} />
            <div className="mt-3 text-sm font-semibold text-slate-950 dark:text-white">
              {isUnlimited ? 'Трафик без ограничений' : `${percent}% использовано`}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {daysLeft > 0 ? `Доступ ещё ${daysLeft} дн.` : 'Проверьте срок доступа'}
            </div>
            <Link href={primaryAction.href} className="btn-primary mt-4 w-full min-h-11">
              {primaryAction.icon}
              {primaryAction.label}
            </Link>
          </div>
        </div>
      </section>

      <SmartInsights
        emailVerified={onboardingState.emailVerified}
        telegramLinked={onboardingState.telegramLinked}
        deviceCount={onboardingState.deviceCount}
        subscriptionExpireAt={subRow?.expireAt ?? null}
        pendingPayment={user.payments[0] ?? null}
        suppress={primaryHomeNudge}
      />
      {personalOffer && <PersonalOffer offer={personalOffer} welcomeBonusOptions={welcomeBonusOptions} />}
      <DashboardOnboardingCard state={onboardingState} supportEnabled={features.support} />

      <TrafficChart
        userId={user.id}
        initialUsedBytes={used.toString()}
        initialLimitBytes={isUnlimited ? null : limit.toString()}
      />

    </div>
  )
}

type DashboardSubscription = {
  plan: { id: string; name: string; priceKopecks: number; durationDays: number } | null
  expireAt: Date
}

type DashboardPlan = {
  id: string
  name: string
  priceKopecks: number
  durationDays: number
}

type DashboardPromoCode = {
  code: string
  discountPercent: number
}

type DashboardOfferSetting = PersonalOfferSetting & {
  promoCode?: { id: string; code: string; discountPercent: number; isActive: boolean } | null
}

type PersonalOfferView = {
  scenario: PersonalOfferScenario
  eyebrow: string
  title: string
  description: string
  href: string
  cta: string
  meta: string
  icon: ReactElement
  tone: 'cyan' | 'emerald' | 'amber' | 'violet'
  action?: 'WELCOME_BONUS'
}

export type WelcomeBonusChoice = {
  type: Exclude<WelcomeBonusType, 'NONE'>
  title: string
  description: string
}

async function findDashboardPromoCode(userId: string, email: string): Promise<DashboardPromoCode | null> {
  const now = new Date()
  const hasActiveSubscription = await prisma.subscription.count({
    where: {
      userId,
      status: { in: ['ACTIVE', 'LIMITED'] },
      expireAt: { gt: now },
    },
  })
  const userHasActiveSubscription = hasActiveSubscription > 0
  const normalizedEmail = email.trim().toLowerCase()

  const candidates = await prisma.promoCode.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
      audience: { in: userHasActiveSubscription ? ['ALL', 'PERSONAL'] : ['ALL', 'NO_ACTIVE_SUBSCRIPTION', 'PERSONAL'] },
    },
    include: {
      redemptions: {
        where: { status: { in: ['PENDING', 'SUCCEEDED'] } },
        select: { userId: true, status: true },
      },
    },
    orderBy: [{ discountPercent: 'desc' }, { createdAt: 'desc' }],
    take: 12,
  })

  const promo = candidates.find((code) => {
    if (code.audience === 'PERSONAL') {
      const allowedEmails = new Set(code.allowedEmails.map((item) => item.trim().toLowerCase()))
      if (!allowedEmails.has(normalizedEmail)) return false
    }
    if (code.maxUses != null && code.redemptions.length >= code.maxUses) return false
    const userUses = code.redemptions.filter((item) => item.userId === userId).length
    return userUses < code.maxUsesPerUser
  })

  return promo ? { code: promo.code, discountPercent: promo.discountPercent } : null
}

function buildPersonalOffer({
  activeSubscription,
  bestPlan,
  deviceCount,
  lastSucceededPaymentAt,
  promoCode,
  offerSettings,
  welcomeBonusAvailable,
  referralsEnabled,
  user,
}: {
  activeSubscription: DashboardSubscription | null
  bestPlan: DashboardPlan | null
  deviceCount: number
  lastSucceededPaymentAt: Date | null
  promoCode: DashboardPromoCode | null
  offerSettings: DashboardOfferSetting[]
  welcomeBonusAvailable: boolean
  referralsEnabled: boolean
  user: { name: string | null; email: string }
}): PersonalOfferView | null {
  const now = Date.now()
  const inactiveDays = lastSucceededPaymentAt
    ? Math.floor((now - lastSucceededPaymentAt.getTime()) / (24 * 60 * 60 * 1000))
    : null

  // Приоритет офферов:
  // 1. Нет активной подписки и пользователь давно не покупал: промокод на возврат.
  // 2. Нет активной подписки: лучший доступный тариф.
  // 3. Подписка скоро закончится: продление.
  // 4. Подписка активна, но устройств нет: подключение.
  // 5. Подписка активна и все базовое готово: реферальный бонус.
  if (!activeSubscription) {
    if (welcomeBonusAvailable) {
      return {
        scenario: 'NO_SUBSCRIPTION',
        eyebrow: 'Приветственный бонус',
        title: 'Выберите подарок на старт',
        description: 'Доступен один бонус: пробный период, промокод или прокрутки рулетки. Выберите то, что полезнее сейчас.',
        href: '/dashboard/bonus-box',
        cta: 'Выбрать бонус',
        meta: 'для нового аккаунта',
        tone: 'emerald',
        icon: <Sparkles className="h-5 w-5" />,
        action: 'WELCOME_BONUS',
      }
    }

    const returnSetting = offerSettings.find((item) => item.scenario === 'RETURN_PROMO')
    const selectedReturnPromo = returnSetting?.promoCode?.isActive
      ? { code: returnSetting.promoCode.code, discountPercent: returnSetting.promoCode.discountPercent }
      : null
    const returnPromo = selectedReturnPromo ?? promoCode
    if (returnPromo && inactiveDays != null && inactiveDays >= OFFER_RETURN_PROMO_DAYS) {
      return renderConfiguredOffer({
        scenario: 'RETURN_PROMO',
        settings: offerSettings,
        values: {
          name: user.name || 'друг',
          email: user.email,
          promo: returnPromo.code,
          discount: String(returnPromo.discountPercent),
          inactive_days: String(inactiveDays),
        },
        fallback: {
          eyebrow: 'Личный оффер',
          title: `Промокод ${returnPromo.code}`,
          description: `Скидка ${returnPromo.discountPercent}% на оплату VPN. Код уже можно применить в тарифах.`,
          href: '/dashboard/plans',
          cta: 'Выбрать тариф',
          meta: `не покупали ${inactiveDays} дн.`,
          tone: 'violet',
        },
        icon: <Gift className="h-5 w-5" />,
      })
    }

    if (!bestPlan) return null
    return renderConfiguredOffer({
      scenario: 'NO_SUBSCRIPTION',
      settings: offerSettings,
      values: {
        name: user.name || 'друг',
        email: user.email,
        plan: bestPlan.name,
        plan_id: bestPlan.id,
        price: formatPrice(bestPlan.priceKopecks),
        duration: String(bestPlan.durationDays),
      },
      fallback: {
        eyebrow: 'Рекомендация',
        title: bestPlan.name,
        description: `${bestPlan.durationDays} дн. доступа за ${formatPrice(bestPlan.priceKopecks)}. Подходит для первого подключения.`,
        href: `/dashboard/plans?plan=${bestPlan.id}`,
        cta: 'Купить VPN',
        meta: 'лучший старт',
        tone: 'cyan',
      },
      icon: <CreditCard className="h-5 w-5" />,
      action: welcomeBonusAvailable
        ? 'WELCOME_BONUS'
        : undefined,
    })
  }

  const daysLeft = Math.ceil((activeSubscription.expireAt.getTime() - now) / (24 * 60 * 60 * 1000))
  if (daysLeft <= OFFER_RENEWAL_DAYS_LEFT) {
    const planName = activeSubscription.plan?.name ?? 'подписку'
    return renderConfiguredOffer({
      scenario: 'RENEWAL_SOON',
      settings: offerSettings,
      values: {
        name: user.name || 'друг',
        email: user.email,
        plan: planName,
        days_left: String(Math.max(daysLeft, 0)),
      },
      fallback: {
        eyebrow: 'Продление',
        title: `Осталось ${Math.max(daysLeft, 0)} дн.`,
        description: `Продлите ${planName}, чтобы доступ не прерывался.`,
        href: '/dashboard/plans',
        cta: 'Продлить',
        meta: 'важно',
        tone: 'amber',
      },
      icon: <Clock3 className="h-5 w-5" />,
    })
  }

  if (deviceCount === 0) {
    return renderConfiguredOffer({
      scenario: 'CONNECT_DEVICE',
      settings: offerSettings,
      values: { name: user.name || 'друг', email: user.email },
      fallback: {
        eyebrow: 'Следующий шаг',
        title: 'Подключите устройство',
        description: 'Откройте подписку, выберите приложение и добавьте VPN в один переход.',
        href: '/dashboard/subscription',
        cta: 'Подключить',
        meta: 'быстрый доступ',
        tone: 'emerald',
      },
      icon: <Laptop className="h-5 w-5" />,
    })
  }

  if (!referralsEnabled) return null

  return renderConfiguredOffer({
    scenario: 'REFERRAL',
    settings: offerSettings,
    values: { name: user.name || 'друг', email: user.email },
    fallback: {
      eyebrow: 'Бонус',
      title: 'Пригласите друга',
      description: 'Отправьте реферальную ссылку и получите дополнительные дни после оплаты друга.',
      href: '/dashboard/referrals',
      cta: 'Открыть рефералку',
      meta: 'активная подписка',
      tone: 'emerald',
    },
    icon: <UsersRound className="h-5 w-5" />,
  })
}

function renderConfiguredOffer({
  scenario,
  settings,
  values,
  fallback,
  icon,
  action,
}: {
  scenario: PersonalOfferScenario
  settings: DashboardOfferSetting[]
  values: Record<string, string>
  fallback: Omit<PersonalOfferView, 'icon' | 'scenario'>
  icon: ReactElement
  action?: PersonalOfferView['action']
}): PersonalOfferView {
  const setting = settings.find((item) => item.scenario === scenario)
  if (!setting) return { ...fallback, scenario, icon, action }
  return {
    scenario,
    eyebrow: renderPersonalOfferTemplate(setting.eyebrow, values) || fallback.eyebrow,
    title: renderPersonalOfferTemplate(setting.title, values) || fallback.title,
    description: renderPersonalOfferTemplate(setting.description, values) || fallback.description,
    href: renderPersonalOfferTemplate(setting.href, values) || fallback.href,
    cta: renderPersonalOfferTemplate(setting.cta, values) || fallback.cta,
    meta: renderPersonalOfferTemplate(setting.meta, values) || fallback.meta,
    tone: normalizeOfferTone(setting.tone),
    icon,
    action,
  }
}

function filterDuplicateHomeOffer(offer: PersonalOfferView | null, state: DashboardOnboardingState) {
  if (!offer) return null
  if (offer.scenario === 'CONNECT_DEVICE' && state.hasRemnawaveProfile && state.deviceCount === 0) return null
  return offer
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

function PersonalOffer({
  offer,
  welcomeBonusOptions,
}: {
  offer: PersonalOfferView
  welcomeBonusOptions: WelcomeBonusChoice[]
}) {
  const tone = personalOfferTone(offer.tone)

  return (
    <section className={`relative overflow-hidden rounded-xl border p-4 shadow-sm sm:p-5 ${tone.shell}`}>
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${tone.line}`} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${tone.icon}`}>
            {offer.icon}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-semibold uppercase tracking-wide ${tone.eyebrow}`}>
                {offer.eyebrow}
              </span>
              <span className="rounded-full border border-white/60 bg-white/70 px-2 py-0.5 text-xs text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-slate-300">
                {offer.meta}
              </span>
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
              {offer.title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {offer.description}
            </p>
          </div>
        </div>
        {offer.action === 'WELCOME_BONUS' ? (
          <WelcomeOfferButton label={offer.cta} options={welcomeBonusOptions} />
        ) : (
          <Link href={offer.href} className="btn-primary min-h-11 shrink-0 justify-center px-4">
            <Sparkles className="h-4 w-4" />
            {offer.cta}
          </Link>
        )}
      </div>
    </section>
  )
}

type WelcomeBonusSettingForDashboard = Prisma.WelcomeBonusSettingGetPayload<{
  include: {
    trialPlan: { select: { id: true; name: true; durationDays: true; isActive: true; isPromo: true } }
    promoCode: { select: { id: true; code: true; discountPercent: true; isActive: true } }
  }
}>

function buildWelcomeBonusOptions(
  setting: WelcomeBonusSettingForDashboard | null,
  state: { trialUsed: boolean; bonusBoxEnabled: boolean }
): WelcomeBonusChoice[] {
  if (!setting?.enabled) return []
  const hasExplicitChoices = setting.trialEnabled || setting.promoCodeEnabled || setting.bonusAttemptsEnabled
  const trialEnabled = hasExplicitChoices ? setting.trialEnabled : setting.type === 'TRIAL_PLAN'
  const promoEnabled = hasExplicitChoices ? setting.promoCodeEnabled : setting.type === 'PROMO_CODE'
  const bonusEnabled = hasExplicitChoices ? setting.bonusAttemptsEnabled : setting.type === 'BONUS_BOX_ATTEMPTS'
  const options: WelcomeBonusChoice[] = []

  if (trialEnabled && setting.trialPlan?.isActive && setting.trialPlan.isPromo && !state.trialUsed) {
    options.push({
      type: 'TRIAL_PLAN',
      title: 'Пробный период',
      description: `${setting.trialPlan.name} на ${setting.trialPlan.durationDays} дн.`,
    })
  }
  if (promoEnabled && setting.promoCode?.isActive) {
    options.push({
      type: 'PROMO_CODE',
      title: 'Промокод',
      description: `${setting.promoCode.code} на ${setting.promoCode.discountPercent}%`,
    })
  }
  if (state.bonusBoxEnabled && bonusEnabled && setting.bonusAttempts > 0) {
    options.push({
      type: 'BONUS_BOX_ATTEMPTS',
      title: 'Рулетка',
      description: `${setting.bonusAttempts} прокруток`,
    })
  }

  return options
}

function isWelcomeBonusEligible({
  activeSubscription,
  user,
}: {
  activeSubscription: DashboardSubscription | null
  user: {
    email: string
    emailVerifiedAt: Date | null
    telegramId: bigint | null
    remnawaveUuid: string | null
    successfulPayments: boolean
    trialUsed: boolean
    welcomeUsed: boolean
  }
}) {
  const hasTrustedIdentity = Boolean(user.telegramId || (user.emailVerifiedAt && !user.email.endsWith('@pending.invalid')))
  if (!hasTrustedIdentity) return false
  return !(
    activeSubscription ||
    user.remnawaveUuid ||
    user.successfulPayments ||
    user.trialUsed ||
    user.welcomeUsed
  )
}

function personalOfferTone(tone: PersonalOfferView['tone']) {
  if (tone === 'amber') {
    return {
      shell: 'border-amber-200 bg-amber-50/80 dark:border-amber-500/25 dark:bg-amber-500/10',
      line: 'bg-gradient-to-r from-amber-400 to-orange-400',
      icon: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-100',
      eyebrow: 'text-amber-700 dark:text-amber-200',
    }
  }
  if (tone === 'emerald') {
    return {
      shell: 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-500/25 dark:bg-emerald-500/10',
      line: 'bg-gradient-to-r from-emerald-400 to-cyan-400',
      icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-100',
      eyebrow: 'text-emerald-700 dark:text-emerald-200',
    }
  }
  if (tone === 'violet') {
    return {
      shell: 'border-violet-200 bg-violet-50/80 dark:border-violet-500/25 dark:bg-violet-500/10',
      line: 'bg-gradient-to-r from-violet-400 to-cyan-400',
      icon: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-100',
      eyebrow: 'text-violet-700 dark:text-violet-200',
    }
  }
  return {
    shell: 'border-cyan-200 bg-cyan-50/80 dark:border-cyan-500/25 dark:bg-cyan-500/10',
    line: 'bg-gradient-to-r from-cyan-400 to-blue-400',
    icon: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-100',
    eyebrow: 'text-cyan-700 dark:text-cyan-200',
  }
}

function SmartInsights({
  emailVerified,
  telegramLinked,
  deviceCount,
  subscriptionExpireAt,
  pendingPayment,
  suppress = null,
}: {
  emailVerified: boolean
  telegramLinked: boolean
  deviceCount: number
  subscriptionExpireAt: Date | null
  pendingPayment: { id: string; confirmationUrl: string | null; createdAt: Date } | null
  suppress?: HomeNudgeKey
}) {
  const now = Date.now()
  const daysLeft = subscriptionExpireAt
    ? Math.ceil((subscriptionExpireAt.getTime() - now) / (24 * 60 * 60 * 1000))
    : null
  const items = [
    pendingPayment
      ? {
          title: 'Есть незавершенная оплата',
          text: 'Можно продолжить оплату или выбрать другой тариф.',
          href: pendingPayment.confirmationUrl || '/dashboard/billing',
          external: Boolean(pendingPayment.confirmationUrl),
          icon: <CreditCard className="h-4 w-4" />,
          tone: 'amber' as const,
        }
      : null,
    daysLeft != null && daysLeft <= 7 && daysLeft >= 0
      ? {
          title: `Подписка закончится через ${daysLeft} дн.`,
          text: 'Продлите заранее, чтобы доступ не прерывался.',
          href: '/dashboard/plans',
          icon: <Clock3 className="h-4 w-4" />,
          tone: 'amber' as const,
        }
      : null,
    suppress !== 'device' && deviceCount === 0 && subscriptionExpireAt
      ? {
          title: 'Устройство еще не подключено',
          text: 'Откройте подписку и добавьте ее в приложение.',
          href: '/dashboard/subscription',
          icon: <Laptop className="h-4 w-4" />,
          tone: 'cyan' as const,
        }
      : null,
    suppress !== 'email' && !emailVerified
      ? {
          title: 'Email не подтвержден',
          text: 'Подтверждение помогает восстановить доступ.',
          href: '/dashboard/settings',
          icon: <Bell className="h-4 w-4" />,
          tone: 'slate' as const,
        }
      : null,
    suppress !== 'telegram' && !telegramLinked
      ? {
          title: 'Telegram не привязан',
          text: 'Привяжите Telegram, чтобы получить бонус и найти старые покупки.',
          href: '/dashboard/settings',
          icon: <MessageCircleQuestion className="h-4 w-4" />,
          tone: 'slate' as const,
        }
      : null,
  ].filter(Boolean).slice(0, 3) as Array<{
    title: string
    text: string
    href: string
    external?: boolean
    icon: ReactElement
    tone: 'amber' | 'cyan' | 'slate'
  }>

  if (items.length === 0) return null

  return (
    <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.title}
          href={item.href}
          target={item.external ? '_blank' : undefined}
          rel={item.external ? 'noreferrer' : undefined}
          className={`group flex min-h-20 items-start gap-3 rounded-lg border p-3 shadow-sm transition-all hover:-translate-y-0.5 ${insightTone(item.tone)}`}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/80 shadow-sm dark:bg-white/10">
            {item.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-950 dark:text-white">{item.title}</span>
            <span className="mt-1 block text-xs leading-5 opacity-80">{item.text}</span>
          </span>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </section>
  )
}

function insightTone(tone: 'amber' | 'cyan' | 'slate') {
  if (tone === 'amber') return 'border-amber-200 bg-amber-50/80 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100'
  if (tone === 'cyan') return 'border-cyan-200 bg-cyan-50/80 text-cyan-800 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-100'
  return 'border-slate-200 bg-white/80 text-slate-600 dark:border-white/10 dark:bg-surface-900/80 dark:text-slate-300'
}

function OverviewMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 px-2 text-center first:pl-0 last:pr-0 sm:px-4 sm:text-left">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate text-base font-semibold text-slate-950 dark:text-white sm:text-lg">{value}</div>
    </div>
  )
}

function UsageRing({ percent, unlimited }: { percent: number; unlimited: boolean }) {
  const value = unlimited ? 100 : Math.max(0, Math.min(percent, 100))
  return (
    <div
      className="grid h-24 w-24 place-items-center rounded-full p-2"
      style={{ background: `conic-gradient(rgb(16 185 129) ${value * 3.6}deg, rgba(148,163,184,0.18) 0deg)` }}
    >
      <div className="grid h-full w-full place-items-center rounded-full bg-white text-lg font-semibold text-slate-950 shadow-inner dark:bg-surface-900 dark:text-white">
        {unlimited ? <ShieldCheck className="h-7 w-7 text-emerald-500" /> : `${value}%`}
      </div>
    </div>
  )
}
