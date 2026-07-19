// /dashboard/subscription — единая ссылка подписки, QR-код и управление доступом.

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError } from '@/lib/remnawave'
import { KeysCard } from '@/components/dashboard/keys-card'
import { DevicesList } from '@/components/dashboard/devices-list'
import Link from 'next/link'
import { CalendarClock, Database, ShieldAlert, Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/dashboard/empty-state'
import { getFeatureFlags } from '@/lib/feature-flags'
import { formatSubscriptionDaysLeft, isSubscriptionExpired } from '@/lib/subscription-time'

export const dynamic = 'force-dynamic'

export default async function SubscriptionPage() {
  const features = await getFeatureFlags()
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const [user, localSubscription] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.uid } }),
    prisma.subscription.findFirst({
      where: { userId: session.uid, status: { in: ['ACTIVE', 'LIMITED'] } },
      orderBy: { expireAt: 'desc' },
      select: { plan: { select: { deviceLimit: true } } },
    }),
  ])
  if (!user?.remnawaveUsername) {
    return (
      <EmptyState
        title="Нет активной подписки"
        description="Выберите тариф, после оплаты здесь появятся QR-код, ссылка и быстрые кнопки подключения."
        icon={<ShieldAlert className="h-7 w-7" />}
        action={<Link href="/dashboard/plans" className="btn-primary">Выбрать тариф</Link>}
      />
    )
  }

  let data
  try {
    data = await remnawave.getSubscriptionByUsername(user.remnawaveUsername)
  } catch (e) {
    if (e instanceof RemnawaveError) {
      return (
        <EmptyState
          title="Не удалось загрузить подписку"
          description={features.support
            ? 'Сервис временно недоступен. Можно повторить загрузку или написать в поддержку.'
            : 'Сервис временно недоступен. Повторите загрузку чуть позже.'}
          icon={<ShieldAlert className="h-7 w-7" />}
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/dashboard/subscription" className="btn-primary">
                Обновить
              </Link>
              {features.support && <Link href="/dashboard/support" className="btn-secondary">В поддержку</Link>}
            </div>
          }
        />
      )
    }
    throw e
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
  const subscriptionExpired = isSubscriptionExpired(u.daysLeft, u.userStatus)
  const expiresAtLabel = new Date(u.expiresAt).toLocaleDateString('ru-RU')
  const statusText = subscriptionExpired
    ? 'Подписка истекла'
    : u.isActive
      ? 'Подписка активна'
      : 'Подписка не активна'

  return (
    <div className="page-stack">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035] sm:p-5">
        <div aria-hidden="true" className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-100/70 blur-3xl dark:bg-cyan-400/10" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
              <span className={`h-2 w-2 rounded-full ${subscriptionExpired ? 'bg-amber-500' : u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              Доступ к VPN
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{statusText}</h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {subscriptionExpired ? `Доступ закончился ${expiresAtLabel}` : `Доступ до ${expiresAtLabel}`}
            </p>
          </div>
          <Link href="/dashboard/plans?intent=renew" className="btn-primary w-full justify-center sm:w-auto sm:px-5">
            <Sparkles className="h-4 w-4" />
            Продлить подписку
          </Link>
        </div>
        <div className="relative mt-5 grid gap-2 sm:grid-cols-2">
          <CompactMetric
            icon={<CalendarClock className="h-4 w-4" />}
            label="Осталось"
            value={formatSubscriptionDaysLeft(u.daysLeft, u.userStatus)}
            hint={subscriptionExpired ? 'Требуется продление' : `до ${expiresAtLabel}`}
          />
          <CompactMetric
            icon={<Database className="h-4 w-4" />}
            label="Трафик"
            value={u.trafficUsed}
            hint={isUnlimited ? 'без ограничений' : `из ${u.trafficLimit}`}
          />
        </div>
      </section>

      <KeysCard subscriptionUrl={data.response.subscriptionUrl} happLink={happLink} />
      <DevicesList embedded deviceLimit={localSubscription?.plan?.deviceLimit} />
    </div>
  )
}

function CompactMetric({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/80 px-3.5 py-3 dark:border-white/[0.07] dark:bg-white/[0.025]">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-cyan-700 shadow-sm dark:bg-white/[0.06] dark:text-cyan-200 dark:shadow-none">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
          <span className="mt-0.5 block break-words text-sm font-semibold leading-snug text-slate-950 dark:text-white">{value}</span>
          <span className="block break-words text-xs leading-5 text-slate-500 dark:text-slate-400">{hint}</span>
        </span>
      </div>
    </div>
  )
}
