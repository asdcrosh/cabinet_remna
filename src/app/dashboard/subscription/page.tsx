// /dashboard/subscription — единая ссылка подписки, QR-код и управление доступом.

import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError, remnawaveUserReference } from '@/lib/remnawave'
import { KeysCard } from '@/components/dashboard/keys-card'
import { DevicesList } from '@/components/dashboard/devices-list'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Gauge, ShieldAlert, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { EmptyState } from '@/components/dashboard/empty-state'
import { getFeatureFlags } from '@/lib/feature-flags'
import { formatSubscriptionDaysLeft, isSubscriptionExpired } from '@/lib/subscription-time'
import { PageHeader } from '@/components/dashboard/page-header'
import { VpnConnectionCheck } from '@/components/dashboard/vpn-connection-check'

export const dynamic = 'force-dynamic'

export default async function SubscriptionPage() {
  const features = await getFeatureFlags()
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const [user, localSubscription] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.uid } }),
    prisma.subscription.findFirst({
      where: { userId: session.uid, status: { in: ['ACTIVE', 'LIMITED', 'PAUSED'] } },
      orderBy: { expireAt: 'desc' },
      select: { plan: { select: { name: true, deviceLimit: true } } },
    }),
  ])
  if (!user?.remnawaveUsername) {
    return (
      <EmptyState
        title="Подписки пока нет"
        description="Выберите срок доступа. Ссылка и подключение появятся здесь сразу после оплаты."
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
  let isFirstConnection = false
  if (!subscriptionExpired) {
    try {
      const devices = await remnawave.getUserDevices(remnawaveUserReference(user))
      isFirstConnection = devices.response.devices.length === 0
    } catch {
      // Не прячем управление у существующего пользователя, если Remnawave временно не ответил.
    }
  }
  const statusText = subscriptionExpired
    ? 'Подписка истекла'
    : u.isActive
      ? 'Подписка активна'
      : 'Подписка не активна'

  return (
    <div className="user-workspace page-stack">
      <PageHeader
        title="Подключение"
        description={isFirstConnection
          ? 'Подключите первое устройство за три шага.'
          : 'Откройте подписку в INСY и управляйте подключёнными устройствами.'}
      />

      <section
        data-testid="subscription-access"
        className={cn('connection-access-summary', subscriptionExpired && 'connection-access-summary--expired')}
      >
        <div className="connection-access-summary__intro">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${subscriptionExpired ? 'bg-amber-500' : u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">{statusText}</h2>
              <span className="text-sm text-slate-400">·</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {localSubscription?.plan?.name ?? 'VPN-подписка'}
              </span>
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
              {subscriptionExpired
                ? 'Продлите доступ, затем ссылка и устройства снова заработают без новой настройки.'
                : isFirstConnection
                  ? 'Ссылка готова. Установите приложение, откройте подписку и включите VPN.'
                  : 'Ссылка готова. Подключите новое устройство или управляйте теми, что уже добавлены.'}
            </p>
          </div>

          <div className="connection-access-summary__action">
            <Link
              href="/dashboard/plans?intent=renew"
              className={`${subscriptionExpired ? 'btn-primary' : 'btn-secondary'} group w-full justify-between min-[1360px]:min-w-44`}
            >
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Продлить
              </span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        <div className="connection-access-summary__metrics">
          <AccessMetric
            icon={<Sparkles className="h-4 w-4" />}
            label="Доступ"
            value={formatSubscriptionDaysLeft(u.daysLeft, u.userStatus)}
          />
          <AccessMetric
            icon={<CalendarDays className="h-4 w-4" />}
            label={subscriptionExpired ? 'Завершилась' : 'Оплачено до'}
            value={expiresAtLabel}
          />
          <AccessMetric
            icon={<Gauge className="h-4 w-4" />}
            label="Трафик"
            value={subscriptionExpired
              ? '0 доступно'
              : `${u.trafficUsed}${isUnlimited ? ' · безлимит' : ` из ${u.trafficLimit}`}`}
          />
        </div>
      </section>

      {!subscriptionExpired && (
        isFirstConnection ? (
          <KeysCard
            subscriptionUrl={data.response.subscriptionUrl}
            happLink={happLink}
            onboarding
            supportEnabled={features.support}
          />
        ) : (
          <>
            <VpnConnectionCheck supportEnabled={features.support} />
            <div className="grid items-start gap-5 min-[1360px]:grid-cols-[minmax(0,1fr)_22rem]">
              <KeysCard subscriptionUrl={data.response.subscriptionUrl} happLink={happLink} />
              <DevicesList
                embedded
                deviceLimit={localSubscription?.plan?.deviceLimit}
                subscriptionUrl={data.response.subscriptionUrl}
              />
            </div>
          </>
        )
      )}
    </div>
  )
}

function AccessMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs uppercase tracking-[0.07em] text-slate-400">{label}</span>
        <strong className="mt-1 block break-words text-sm text-slate-950 dark:text-white">{value}</strong>
      </span>
    </div>
  )
}
