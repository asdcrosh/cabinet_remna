// Главная страница кабинета: тянем данные подписки, показываем крупные
// карточки со статусом, остатком трафика и кнопкой продления.

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError } from '@/lib/remnawave'
import { formatBytes, formatPrice } from '@/lib/format'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { ProgressBar } from '@/components/dashboard/progress-bar'
import { TrafficChart } from '@/components/dashboard/traffic-chart'
import { redirect } from 'next/navigation'
import { Activity, AlertTriangle, CheckCircle2, CreditCard, Gauge, KeyRound, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
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

  if (!user.remnawaveUsername) {
    return <OnboardingState emailVerified={Boolean(user.emailVerifiedAt)} />
  }

  const used = sub ? readRemnawaveBigInt(sub, ['trafficUsedBytes', 'usedTrafficBytes']) : 0n
  const limit = sub ? readRemnawaveBigInt(sub, ['trafficLimitBytes', 'trafficLimit']) : 0n
  const isUnlimited = limit === 0n
  const percent = isUnlimited ? 0 : Math.min(100, Math.round((Number(used) / Number(limit || 1n)) * 100))

  return (
    <div className="space-y-6">
      <PageHeader
        title="VPN готов"
        description="Управляйте подпиской, устройствами и продлением"
        action={<Link href="/dashboard/subscription" className="btn-primary">Открыть подписку</Link>}
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Статус"
          value={<StatusBadge status={sub?.userStatus ?? 'DISABLED'} />}
          hint={sub ? `${sub.daysLeft} дн. осталось` : 'Подписка не найдена'}
          icon={<ShieldCheck className="h-5 w-5" />}
        />

        <StatCard
          label="Трафик"
          value={formatBytes(used)}
          hint={`из ${isUnlimited ? 'безлимита' : formatBytes(limit)}`}
          icon={<Gauge className="h-5 w-5" />}
        />

        <div className="card">
          <div className="flex items-start justify-between gap-4">
            <div>
          <p className="stat-label">Тариф</p>
              <div className="mt-2 stat">{subRow?.plan?.name ?? '—'}</div>
              <p className="stat-label">
                {subRow?.plan ? formatPrice(subRow.plan.priceKopecks) : '—'} / {subRow?.plan?.durationDays ?? '—'} дн.
              </p>
            </div>
            <div className="rounded-2xl bg-brand-50 p-3 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
              <KeyRound className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <ProgressBar value={percent} />
          </div>
          <div className="mt-4 flex gap-2">
            <Link href="/dashboard/subscription" className="btn-primary">Подключение</Link>
            <Link href="/dashboard/plans" className="btn-secondary">Продлить</Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <QuickAction
          icon={<KeyRound className="h-5 w-5" />}
          title="Подключить устройство"
          description="Откройте QR-код и добавьте подписку в приложение."
          href="/dashboard/subscription"
          action="Подключить"
        />
        <QuickAction
          icon={<CreditCard className="h-5 w-5" />}
          title="Продлить VPN"
          description="Выберите тариф и оплатите онлайн."
          href="/dashboard/plans"
          action="Смотреть тарифы"
        />
        <QuickAction
          icon={<Activity className="h-5 w-5" />}
          title="Проверить устройства"
          description="Посмотрите активные устройства и отвяжите лишние."
          href="/dashboard/devices"
          action="Устройства"
        />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Activity className="h-5 w-5 text-brand-500" />
            Потребление трафика
          </h2>
          <span className="text-sm text-slate-500">за 30 дней</span>
        </div>
        <TrafficChart userId={user.id} />
      </div>
    </div>
  )
}

function OnboardingState({ emailVerified }: { emailVerified: boolean }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Купить VPN"
        description="Выберите тариф и получите доступ в личном кабинете"
        action={<Link href="/dashboard/plans" className="btn-primary">Выбрать тариф</Link>}
      />

      <div className="card relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-brand-500" />
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-lg bg-slate-950 text-cyan-200 shadow-lg shadow-slate-950/15 dark:bg-white dark:text-slate-950">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">VPN без лишних шагов</h2>
            <p className="mt-2 max-w-xl text-slate-500 dark:text-slate-400">
              Выберите тариф и оплатите его в кабинете. После активации останется добавить подписку в VPN-приложение.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link href="/dashboard/plans" className="btn-primary">Выбрать тариф</Link>
              <Link href="/dashboard/settings" className="btn-secondary">Профиль</Link>
            </div>
          </div>
          <div className="grid gap-3">
            <Step
              done={emailVerified}
              title={emailVerified ? 'Email добавлен' : 'Вход через Telegram'}
              description={emailVerified ? 'Доступен вход через сайт' : 'Email можно добавить позже в настройках'}
            />
            <Step done={false} title="Выберите тариф" description="Срок, трафик и лимит устройств" />
            <Step done={false} title="Оплатите онлайн" description="После оплаты вернём вас в кабинет" />
            <Step done={false} title="Подключитесь" description="Добавьте подписку по QR-коду" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <QuickAction
          icon={<CreditCard className="h-5 w-5" />}
          title="Тарифы"
          description="Сравните планы и оплатите подходящий."
          href="/dashboard/plans"
          action="К тарифам"
        />
        <QuickAction
          icon={<KeyRound className="h-5 w-5" />}
          title="Подключение"
          description="После оплаты откроется QR-код и ссылка подписки."
          href="/dashboard/subscription"
          action="Открыть подписку"
        />
        <QuickAction
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Перенос подписки"
          description="Если уже покупали раньше, проверьте профиль."
          href="/dashboard/settings"
          action="Настройки"
        />
      </div>
    </div>
  )
}

function Step({ done, title, description }: { done: boolean; title: string; description: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-surface-800/70">
      <div className={done ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}>
        <CheckCircle2 className="h-5 w-5" />
      </div>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{description}</div>
      </div>
    </div>
  )
}

function QuickAction({
  icon,
  title,
  description,
  href,
  action,
}: {
  icon: React.ReactNode
  title: string
  description: string
  href: string
  action: string
}) {
  return (
    <Link href={href} className="card block transition-transform duration-200 hover:-translate-y-0.5">
      <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg border border-slate-100 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-surface-800 dark:text-cyan-200">
        {icon}
      </div>
      <div className="font-semibold">{title}</div>
      <p className="mt-1 min-h-10 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      <div className="mt-4 text-sm font-medium text-brand-600 dark:text-cyan-200">{action}</div>
    </Link>
  )
}
