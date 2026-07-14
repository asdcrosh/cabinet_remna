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

export const dynamic = 'force-dynamic'

export default async function SubscriptionPage() {
  const features = getFeatureFlags()
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
  const statusText = u.isActive ? 'Подписка активна' : 'Подписка не активна'

  return (
    <div className="page-stack">
      <section className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-surface-900 sm:p-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-500" />
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={u.isActive ? 'badge-active' : 'badge-disabled'}>{statusText}</span>
              <span className="badge bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                {u.username}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">Подключение VPN</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">QR-код, ссылка подписки и приложения для вашего устройства</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[32rem]">
            <CompactMetric
              icon={<CalendarClock className="h-4 w-4" />}
              label="До"
              value={new Date(u.expiresAt).toLocaleDateString('ru-RU')}
              hint={`${u.daysLeft} дн.`}
            />
            <CompactMetric
              icon={<Database className="h-4 w-4" />}
              label="Трафик"
              value={u.trafficUsed}
              hint={isUnlimited ? 'безлимит' : `из ${u.trafficLimit}`}
            />
            <Link href="/dashboard/plans?intent=renew" className="btn-primary min-h-11 justify-center">
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
    <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
      <div className="truncate text-xs text-slate-500">{hint}</div>
    </div>
  )
}
