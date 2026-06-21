// /dashboard/subscription — ключи, QR-код, кнопка перевыпуска.

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { remnawave, RemnawaveError } from '@/lib/remnawave'
import { KeysCard } from '@/components/dashboard/keys-card'
import Link from 'next/link'
import { CalendarClock, Database, Infinity, ShieldAlert } from 'lucide-react'
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
        <p className="text-slate-500 mt-2">Чтобы получить ключи, выберите тариф.</p>
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Подписка"
        description="Ключи доступа, QR-код и параметры текущей подписки"
        action={<Link href="/dashboard/plans" className="btn-primary">Продлить</Link>}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
