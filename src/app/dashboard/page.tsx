// Главная страница кабинета: компактный обзор подписки и быстрые действия.

import Link from 'next/link'
import type { ReactElement, ReactNode } from 'react'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError } from '@/lib/remnawave'
import { formatBytes, formatPrice } from '@/lib/format'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { ProgressBar } from '@/components/dashboard/progress-bar'
import { TrafficChart } from '@/components/dashboard/traffic-chart'
import { DashboardOnboardingCard, type DashboardOnboardingState } from '@/components/dashboard/onboarding-card'
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
import { getFreshPendingPaymentCutoff, reconcileStalePendingPaymentsForUser } from '@/lib/payment-sync'
import { getPlanAudienceContext, isPlanAvailableForUser } from '@/lib/plan-access'

export const dynamic = 'force-dynamic'

export default async function DashboardHome() {
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  await reconcileStalePendingPaymentsForUser(session.uid)
  const freshPendingCutoff = getFreshPendingPaymentCutoff()
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    include: {
      subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: true } },
      payments: {
        where: { status: 'PENDING', createdAt: { gt: freshPendingCutoff } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, confirmationUrl: true, createdAt: true },
      },
      _count: { select: { devices: true } },
    },
  })
  if (!user) {
    logWarn('auth.dashboard.stale_session_redirect', { userId: session.uid })
    redirect('/login?next=/dashboard')
  }

  // Если есть Remnawave-профиль — попробуем освежить карточку
  let remnawaveCard: Awaited<ReturnType<typeof remnawave.getSubscriptionByUsername>> | null = null
  if (user.remnawaveUsername) {
    try {
      remnawaveCard = await remnawave.getSubscriptionByUsername(user.remnawaveUsername)
    } catch (e) {
      if (!(e instanceof RemnawaveError)) throw e
    }
  }

  const sub = remnawaveCard?.response.user
  const subRow = user.subscriptions[0] ?? null
  const [audienceContext, availablePlans, lastSucceededPayment, promoOfferCode] = await Promise.all([
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
  ])
  const visiblePaidPlans = audienceContext
    ? availablePlans.filter((plan) => isPlanAvailableForUser(plan, audienceContext))
    : availablePlans.filter((plan) => plan.availability === 'ALL')
  const personalOffer = buildPersonalOffer({
    activeSubscription: subRow && ['ACTIVE', 'LIMITED'].includes(subRow.status) && subRow.expireAt > new Date()
      ? subRow
      : null,
    bestPlan: visiblePaidPlans[0] ?? null,
    deviceCount: user._count.devices,
    lastSucceededPaymentAt: lastSucceededPayment?.paidAt ?? lastSucceededPayment?.createdAt ?? null,
    promoCode: promoOfferCode,
  })
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
      <div className="space-y-4">
        <CompactHeader title="Главная" description="Начните пользоваться VPN" />
        <DashboardOnboardingCard state={onboardingState} mode="full" />
        {personalOffer && <PersonalOffer offer={personalOffer} />}
        <SmartInsights
          emailVerified={onboardingState.emailVerified}
          telegramLinked={onboardingState.telegramLinked}
          deviceCount={onboardingState.deviceCount}
          subscriptionExpireAt={subRow?.expireAt ?? null}
          pendingPayment={user.payments[0] ?? null}
        />
        <PromoGrid />
      </div>
    )
  }

  const used = sub ? readRemnawaveBigInt(sub, ['trafficUsedBytes', 'usedTrafficBytes']) : 0n
  const limit = sub ? readRemnawaveBigInt(sub, ['trafficLimitBytes', 'trafficLimit']) : 0n
  const isUnlimited = limit === 0n
  const percent = isUnlimited ? 0 : Math.min(100, Math.round((Number(used) / Number(limit || 1n)) * 100))
  const daysLeft = sub?.daysLeft ?? 0

  return (
    <div className="space-y-4">
      <CompactHeader
        title="Главная"
        description="Подписка и использование VPN"
        actionHref="/dashboard/subscription"
        actionLabel="Подключение"
      />

      <DashboardOnboardingCard state={onboardingState} />
      {personalOffer && <PersonalOffer offer={personalOffer} />}
      <SmartInsights
        emailVerified={onboardingState.emailVerified}
        telegramLinked={onboardingState.telegramLinked}
        deviceCount={onboardingState.deviceCount}
        subscriptionExpireAt={subRow?.expireAt ?? null}
        pendingPayment={user.payments[0] ?? null}
      />

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

      <section className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-surface-900 sm:p-5">
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-100/70 blur-3xl dark:bg-cyan-500/10" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-emerald-100/60 blur-3xl dark:bg-emerald-500/10" />

        <div className="relative grid gap-5 xl:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-2xl font-semibold leading-tight text-slate-950 dark:text-white">
                    {subRow?.plan?.name ?? 'VPN-подписка'}
                  </h2>
                  <StatusBadge status={sub?.userStatus ?? 'DISABLED'} />
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {subRow?.plan
                    ? `${formatPrice(subRow.plan.priceKopecks)} · ${subRow.plan.durationDays} дн.`
                    : 'Тариф синхронизируется'}
                </p>
              </div>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 shadow-lg shadow-slate-950/10 dark:bg-white dark:text-slate-950">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <OverviewMetric label="Осталось" value={sub ? `${daysLeft} дн.` : '—'} />
              <OverviewMetric label="Использовано" value={formatBytes(used)} />
              <OverviewMetric label="Лимит" value={isUnlimited ? 'Безлимит' : formatBytes(limit)} />
            </div>

            {!isUnlimited && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="mb-2 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Трафик</span>
                  <span>{percent}%</span>
                </div>
                <ProgressBar value={percent} />
              </div>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-3 xl:w-56 xl:grid-cols-1">
            <CompactAction href="/dashboard/subscription" icon={<KeyRound />} label="Подключить" />
            <CompactAction href="/dashboard/plans" icon={<CreditCard />} label="Продлить" />
            <CompactAction href="/dashboard/devices" icon={<Laptop />} label="Устройства" />
          </div>
        </div>
      </section>

      <TrafficChart
        userId={user.id}
        initialUsedBytes={used.toString()}
        initialLimitBytes={isUnlimited ? null : limit.toString()}
      />

      <PromoGrid />
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

type PersonalOfferView = {
  eyebrow: string
  title: string
  description: string
  href: string
  cta: string
  meta: string
  icon: ReactElement
  tone: 'cyan' | 'emerald' | 'amber' | 'violet'
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
}: {
  activeSubscription: DashboardSubscription | null
  bestPlan: DashboardPlan | null
  deviceCount: number
  lastSucceededPaymentAt: Date | null
  promoCode: DashboardPromoCode | null
}): PersonalOfferView | null {
  const now = Date.now()
  const inactiveDays = lastSucceededPaymentAt
    ? Math.floor((now - lastSucceededPaymentAt.getTime()) / (24 * 60 * 60 * 1000))
    : null

  if (!activeSubscription) {
    if (promoCode && (inactiveDays == null || inactiveDays >= 45)) {
      return {
        eyebrow: 'Личный оффер',
        title: `Промокод ${promoCode.code}`,
        description: `Скидка ${promoCode.discountPercent}% на оплату VPN. Код уже можно применить в тарифах.`,
        href: '/dashboard/plans',
        cta: 'Выбрать тариф',
        meta: 'для возвращения',
        icon: <Gift className="h-5 w-5" />,
        tone: 'violet',
      }
    }

    if (!bestPlan) return null
    return {
      eyebrow: 'Рекомендация',
      title: bestPlan.name,
      description: `${bestPlan.durationDays} дн. доступа за ${formatPrice(bestPlan.priceKopecks)}.`,
      href: `/dashboard/plans?plan=${bestPlan.id}`,
      cta: 'Купить VPN',
      meta: 'лучший старт',
      icon: <CreditCard className="h-5 w-5" />,
      tone: 'cyan',
    }
  }

  const daysLeft = Math.ceil((activeSubscription.expireAt.getTime() - now) / (24 * 60 * 60 * 1000))
  if (daysLeft <= 7) {
    return {
      eyebrow: 'Продление',
      title: `Осталось ${Math.max(daysLeft, 0)} дн.`,
      description: activeSubscription.plan
        ? `Продлите ${activeSubscription.plan.name}, чтобы доступ не прерывался.`
        : 'Продлите подписку заранее, чтобы доступ не прерывался.',
      href: '/dashboard/plans',
      cta: 'Продлить',
      meta: 'важно',
      icon: <Clock3 className="h-5 w-5" />,
      tone: 'amber',
    }
  }

  if (deviceCount === 0) {
    return {
      eyebrow: 'Следующий шаг',
      title: 'Подключите устройство',
      description: 'Откройте подписку, выберите приложение и добавьте VPN в один переход.',
      href: '/dashboard/subscription',
      cta: 'Подключить',
      meta: 'быстрый доступ',
      icon: <Laptop className="h-5 w-5" />,
      tone: 'emerald',
    }
  }

  return {
    eyebrow: 'Бонус',
    title: 'Пригласите друга',
    description: 'Отправьте реферальную ссылку и получите дополнительные дни после оплаты друга.',
    href: '/dashboard/referrals',
    cta: 'Открыть рефералку',
    meta: 'активная подписка',
    icon: <UsersRound className="h-5 w-5" />,
    tone: 'emerald',
  }
}

function PersonalOffer({ offer }: { offer: PersonalOfferView }) {
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
        <Link href={offer.href} className="btn-primary min-h-11 shrink-0 justify-center px-4">
          <Sparkles className="h-4 w-4" />
          {offer.cta}
        </Link>
      </div>
    </section>
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
}: {
  emailVerified: boolean
  telegramLinked: boolean
  deviceCount: number
  subscriptionExpireAt: Date | null
  pendingPayment: { id: string; confirmationUrl: string | null; createdAt: Date } | null
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
    deviceCount === 0 && subscriptionExpireAt
      ? {
          title: 'Устройство еще не подключено',
          text: 'Откройте подписку и добавьте ее в приложение.',
          href: '/dashboard/subscription',
          icon: <Laptop className="h-4 w-4" />,
          tone: 'cyan' as const,
        }
      : null,
    !emailVerified
      ? {
          title: 'Email не подтвержден',
          text: 'Подтверждение помогает восстановить доступ.',
          href: '/dashboard/settings',
          icon: <Bell className="h-4 w-4" />,
          tone: 'slate' as const,
        }
      : null,
    !telegramLinked
      ? {
          title: 'Telegram не привязан',
          text: 'Это поможет найти старые покупки и подписки.',
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
    <section className="grid gap-3 md:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.title}
          href={item.href}
          target={item.external ? '_blank' : undefined}
          rel={item.external ? 'noreferrer' : undefined}
          className={`group flex min-h-24 items-start gap-3 rounded-lg border p-4 shadow-sm transition-all hover:-translate-y-0.5 ${insightTone(item.tone)}`}
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

function CompactHeader({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string
  description: string
  actionHref?: string
  actionLabel?: string
}) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-950 dark:text-white sm:text-2xl">{title}</h1>
        <p className="truncate text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn-secondary min-h-9 shrink-0 px-3 py-1.5">
          {actionLabel}
        </Link>
      )}
    </header>
  )
}

function OverviewMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-slate-950 dark:text-white">{value}</div>
    </div>
  )
}

function CompactAction({ href, icon, label }: { href: string; icon: ReactElement; label: string }) {
  return (
    <Link
      href={href}
      className="group flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50/70 hover:text-cyan-800 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:border-cyan-500/30 dark:hover:bg-cyan-500/10"
    >
      <span className="text-slate-500 transition group-hover:text-cyan-700 dark:text-slate-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {label}
      <ArrowRight className="ml-auto hidden h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 sm:block" />
    </Link>
  )
}

function PromoGrid() {
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <PromoBlock
        href="/dashboard/referrals"
        icon={<UsersRound className="h-5 w-5" />}
        title="Пригласите друга"
        description="Получайте бонусные дни"
        tone="cyan"
      />
      <PromoBlock
        href="/dashboard/bonus-box"
        icon={<Gift className="h-5 w-5" />}
        title="Откройте подарок"
        description="Бонусы за активность"
        tone="emerald"
      />
    </section>
  )
}

function PromoBlock({
  href,
  icon,
  title,
  description,
  tone,
}: {
  href: string
  icon: ReactNode
  title: string
  description: string
  tone: 'cyan' | 'emerald'
}) {
  const toneClass = tone === 'cyan'
    ? 'border-cyan-200/70 bg-cyan-50/80 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200'
    : 'border-emerald-200/70 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'

  return (
    <Link
      href={href}
      className={`group flex min-h-24 items-center gap-3 rounded-lg border p-4 transition-transform hover:-translate-y-0.5 ${toneClass}`}
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/75 shadow-sm dark:bg-white/10">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-slate-950 dark:text-white">{title}</div>
        <div className="text-sm opacity-80">{description}</div>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
