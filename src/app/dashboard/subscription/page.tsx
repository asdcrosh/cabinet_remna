// /dashboard/subscription — единая ссылка подписки, QR-код и управление доступом.

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError } from '@/lib/remnawave'
import { KeysCard } from '@/components/dashboard/keys-card'
import Link from 'next/link'
import { CalendarClock, Database, ShieldAlert } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SubscriptionPage() {
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user?.remnawaveUsername) {
    return (
      <div className="card text-center py-16">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-semibold">Нет активной подписки</h1>
        <p className="text-slate-500 mt-2">Выберите тариф, чтобы активировать VPN.</p>
        <Link href="/dashboard/plans" className="btn-primary mt-6 inline-flex">
          Выбрать тариф
        </Link>
      </div>
    )
  }

  let data
  try {
    data = await remnawave.getSubscriptionByUsername(user.remnawaveUsername)
  } catch (e) {
    if (e instanceof RemnawaveError) {
      return (
        <div className="card text-center py-16">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-semibold text-red-600">Не удалось загрузить подписку</h1>
          <p className="text-slate-500 mt-2">Сервис временно недоступен. Попробуйте обновить страницу чуть позже.</p>
        </div>
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
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-surface-900 sm:p-5">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-300 to-blue-500" />
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
