// /dashboard/subscription — единая ссылка подписки, QR-код и управление доступом.

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError } from '@/lib/remnawave'
import { KeysCard } from '@/components/dashboard/keys-card'
import { DevicesList } from '@/components/dashboard/devices-list'
import Link from 'next/link'
import { ShieldAlert, Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/dashboard/empty-state'
import { getFeatureFlags } from '@/lib/feature-flags'
import { formatSubscriptionDaysLeft, isSubscriptionExpired } from '@/lib/subscription-time'
import { PageHeader } from '@/components/dashboard/page-header'

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
      <PageHeader
        title="Подключение"
        description="Ссылка, приложения и подключённые устройства."
        action={(
          <Link href="/dashboard/plans?intent=renew" className={`${subscriptionExpired ? 'btn-primary' : 'btn-secondary'} w-full justify-center sm:w-auto`}>
            <Sparkles className="h-4 w-4" />
            Продлить
          </Link>
        )}
      />

      <section className="dashboard-signal rounded-xl border border-slate-200 bg-white p-4 pl-5 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${subscriptionExpired ? 'bg-amber-500' : u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">{statusText}</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {subscriptionExpired ? `Доступ закончился ${expiresAtLabel}` : `Доступ до ${expiresAtLabel}`}
        </p>
        <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 text-sm dark:border-white/10 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">Осталось</span>
            <strong>{formatSubscriptionDaysLeft(u.daysLeft, u.userStatus)}</strong>
          </div>
          <div className="flex items-center justify-between gap-3 sm:border-l sm:border-slate-200 sm:pl-3 dark:sm:border-white/10">
            <span className="text-slate-500 dark:text-slate-400">Трафик</span>
            <strong>{u.trafficUsed}{isUnlimited ? ' · безлимит' : ` из ${u.trafficLimit}`}</strong>
          </div>
        </div>
      </section>

      {subscriptionExpired ? (
        <div className="border-l-2 border-amber-400 px-3 py-1 text-sm text-slate-600 dark:text-slate-300">
          После продления ссылка и приложения снова появятся здесь.
        </div>
      ) : (
        <>
          <KeysCard subscriptionUrl={data.response.subscriptionUrl} happLink={happLink} />
          <DevicesList embedded deviceLimit={localSubscription?.plan?.deviceLimit} />
        </>
      )}
    </div>
  )
}
