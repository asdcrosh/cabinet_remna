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
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <span className={subscriptionExpired ? 'badge-expired' : u.isActive ? 'badge-active' : 'badge-disabled'}>{statusText}</span>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Подписка</h1>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto] xl:min-w-[34rem]">
            <CompactMetric
              icon={<CalendarClock className="h-4 w-4" />}
              label={subscriptionExpired ? 'Срок' : 'До'}
              value={subscriptionExpired ? 'Истекла' : expiresAtLabel}
              hint={subscriptionExpired ? `Была активна до ${expiresAtLabel}` : formatSubscriptionDaysLeft(u.daysLeft, u.userStatus)}
            />
            <CompactMetric
              icon={<Database className="h-4 w-4" />}
              label="Трафик"
              value={u.trafficUsed}
              hint={isUnlimited ? 'безлимит' : `из ${u.trafficLimit}`}
            />
            <Link href="/dashboard/plans?intent=renew" className="btn-primary col-span-2 justify-center sm:col-span-1 sm:px-5">
              Продлить
            </Link>
          </div>
        </div>
      </section>

      <KeysCard subscriptionUrl={data.response.subscriptionUrl} happLink={happLink} />

      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/dashboard/devices" className="font-medium hover:text-cyan-700 dark:hover:text-cyan-200">Мои устройства</Link>
        {features.support && <Link href="/dashboard/support" className="font-medium hover:text-cyan-700 dark:hover:text-cyan-200">Помощь с подключением</Link>}
      </div>
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
    <div className="min-w-0 border-l border-slate-200 px-3.5 py-1 dark:border-white/10">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
      <div className="truncate text-xs text-slate-500">{hint}</div>
    </div>
  )
}
