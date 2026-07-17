// /dashboard/subscription — единая ссылка подписки, QR-код и управление доступом.

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError } from '@/lib/remnawave'
import { KeysCard } from '@/components/dashboard/keys-card'
import Link from 'next/link'
import { CalendarClock, Database, ShieldAlert } from 'lucide-react'
import { EmptyState } from '@/components/dashboard/empty-state'
import { getFeatureFlags } from '@/lib/feature-flags'
import { formatSubscriptionDaysLeft, isSubscriptionExpired } from '@/lib/subscription-time'

export const dynamic = 'force-dynamic'

export default async function SubscriptionPage() {
  const features = await getFeatureFlags()
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
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
      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Доступ к VPN</div>
            <div className="mt-2 flex items-center gap-2.5">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${subscriptionExpired ? 'bg-amber-500' : u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{statusText}</h1>
            </div>
            <p className="mt-1.5 text-sm text-slate-500">
              {subscriptionExpired ? `Доступ закончился ${expiresAtLabel}` : `Доступ до ${expiresAtLabel}`}
            </p>
          </div>
          <Link href="/dashboard/plans?intent=renew" className="btn-primary w-full justify-center sm:w-auto sm:px-5">Продлить</Link>
        </div>
        <div className="mt-5 grid gap-y-4 border-t border-slate-100 pt-4 dark:border-white/10 sm:grid-cols-2">
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
            divided
          />
        </div>
      </section>

      <KeysCard subscriptionUrl={data.response.subscriptionUrl} happLink={happLink} />

    </div>
  )
}

function CompactMetric({
  icon,
  label,
  value,
  hint,
  divided = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  divided?: boolean
}) {
  return (
    <div className={`min-w-0 px-1 sm:px-3.5 ${divided ? 'sm:border-l sm:border-slate-200 dark:sm:border-white/10' : ''}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-semibold leading-snug">{value}</div>
      <div className="break-words text-xs leading-5 text-slate-500">{hint}</div>
    </div>
  )
}
