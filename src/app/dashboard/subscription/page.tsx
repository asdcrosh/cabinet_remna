// /dashboard/subscription — единая ссылка подписки, QR-код и управление доступом.

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError } from '@/lib/remnawave'
import { KeysCard } from '@/components/dashboard/keys-card'
import Link from 'next/link'
import { Activity, CalendarClock, Database, Infinity, ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/page-header'
import { StatCard } from '@/components/dashboard/stat-card'

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

  const u = data.response.user
  const isUnlimited = u.trafficLimitBytes === '0'
  const statusText = u.isActive ? 'Подписка активна' : 'Подписка не активна'

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-surface-900 sm:p-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-300 to-blue-500" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={u.isActive ? 'badge-active' : 'badge-disabled'}>{statusText}</span>
              <span className="badge bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                {u.username}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Подключение VPN</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Добавьте подписку в приложение по кнопке, QR-коду или ссылке. Одна подписка работает на всех ваших устройствах.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
            <Link href="/dashboard/plans" className="btn-primary min-h-10 justify-center">
              Продлить
            </Link>
            <Link href="/dashboard/devices" className="btn-secondary min-h-10 justify-center">
              Устройства
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Статус"
          value={u.isActive ? 'Активна' : 'Отключена'}
          hint={u.userStatus}
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          label="Действует до"
          value={new Date(u.expiresAt).toLocaleDateString('ru-RU')}
          hint={`${u.daysLeft} дн. осталось`}
          icon={<CalendarClock className="h-5 w-5" />}
        />
        <StatCard
          label="Использовано"
          value={u.trafficUsed}
          hint={`из ${isUnlimited ? 'безлимита' : u.trafficLimit}`}
          icon={<Database className="h-5 w-5" />}
        />
        <StatCard
          label="За всё время"
          value={u.lifetimeTrafficUsed}
          hint="общий трафик"
          icon={<Infinity className="h-5 w-5" />}
        />
      </div>

      <KeysCard subscriptionUrl={data.response.subscriptionUrl} />
    </div>
  )
}
