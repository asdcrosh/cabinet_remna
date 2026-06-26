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
  CreditCard,
  Gift,
  KeyRound,
  Laptop,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { logWarn } from '@/lib/logger'
import { readRemnawaveBigInt } from '@/lib/remnawave-usage'

export const dynamic = 'force-dynamic'

export default async function DashboardHome() {
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    include: {
      subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: true } },
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

      <section className="card overflow-hidden p-0">
        <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-semibold sm:text-2xl">
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
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 dark:bg-white dark:text-slate-950">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
              <OverviewMetric label="Осталось" value={sub ? `${daysLeft} дн.` : '—'} />
              <OverviewMetric label="Использовано" value={formatBytes(used)} />
              <OverviewMetric
                className="col-span-2 sm:col-span-1"
                label="Лимит"
                value={isUnlimited ? 'Безлимит' : formatBytes(limit)}
              />
            </div>

            {!isUnlimited && (
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs text-slate-500">
                  <span>Трафик</span>
                  <span>{percent}%</span>
                </div>
                <ProgressBar value={percent} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 border-t border-slate-100 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.025] lg:grid-cols-1 lg:border-l lg:border-t-0">
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
  className = '',
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={className}>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-lg font-semibold">{value}</div>
    </div>
  )
}

function CompactAction({ href, icon, label }: { href: string; icon: ReactElement; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-20 flex-col items-center justify-center gap-1.5 border-r border-slate-100 px-2 py-3 text-center text-xs font-medium transition-colors last:border-r-0 hover:bg-white dark:border-white/10 dark:hover:bg-white/5 lg:min-h-0 lg:flex-row lg:justify-start lg:border-b lg:border-r-0 lg:px-4 lg:py-4 lg:text-sm lg:last:border-b-0"
    >
      <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {label}
      <ArrowRight className="ml-auto hidden h-4 w-4 text-slate-400 lg:block" />
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
