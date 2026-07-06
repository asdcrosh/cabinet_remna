// /dashboard/subscription — единая ссылка подписки, QR-код и управление доступом.

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError } from '@/lib/remnawave'
import { KeysCard } from '@/components/dashboard/keys-card'
import Link from 'next/link'
import { CalendarClock, CreditCard, Database, LifeBuoy, ShieldAlert } from 'lucide-react'
import { EmptyState } from '@/components/dashboard/empty-state'

export const dynamic = 'force-dynamic'

export default async function SubscriptionPage() {
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
          description="Сервис временно недоступен. Можно повторить загрузку или написать в поддержку."
          icon={<ShieldAlert className="h-7 w-7" />}
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/dashboard/subscription" className="btn-primary">
                Обновить
              </Link>
              <Link href="/dashboard/support" className="btn-secondary">
                В поддержку
              </Link>
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
      <section className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-surface-900 sm:p-5">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-400 via-emerald-300 to-transparent" />
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={u.isActive ? 'badge-active' : 'badge-disabled'}>{statusText}</span>
              <span className="badge bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                {u.username}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Подписка</h1>
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
            <Link href="/dashboard/plans" className="btn-primary min-h-10 justify-center">
              Продлить
            </Link>
          </div>
        </div>
      </section>

      <section className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
        <Link href="/dashboard/plans" className="quick-action">
          <CreditCard className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
          Продлить подписку
        </Link>
        <Link href="/dashboard/devices" className="quick-action">
          <Database className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
          Мои устройства
        </Link>
        <Link href="/dashboard/support" className="quick-action">
          <LifeBuoy className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
          Помощь с подключением
        </Link>
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
