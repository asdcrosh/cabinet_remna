import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PlanCard } from '@/components/dashboard/plan-card'
import { getCurrentUser } from '@/lib/auth/cookies'
import { buildPlanCatalog } from '@/lib/plan-catalog'
import { getBrandName } from '@/lib/branding'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Оплата подписки' }

export default async function PayPage({ searchParams }: { searchParams: Promise<{ plan?: string | string[] }> }) {
  const rawPlanId = (await searchParams).plan
  const planId = typeof rawPlanId === 'string' && rawPlanId.length <= 100 ? rawPlanId.trim() : ''
  const session = await getCurrentUser()
  if (!session) {
    const next = planId ? `/pay?plan=${encodeURIComponent(planId)}` : '/dashboard/plans'
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }

  const catalog = await buildPlanCatalog({ userId: session.uid, linkedPlanId: planId })
  const plan = catalog.plans.find(item => item.id === planId && !item.isPromo)
  const yookassa = catalog.paymentProviders.find(provider => provider.id === 'YOOKASSA')

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-8 text-white sm:py-14">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">{getBrandName()}</p><h1 className="mt-2 text-3xl font-bold">Оплата подписки</h1></div>
          <Link href="/dashboard/plans" className="text-sm text-slate-300 underline underline-offset-4">Все тарифы</Link>
        </div>
        <div className="mb-6 grid grid-cols-3 gap-2 text-center text-xs sm:text-sm">
          <div className="rounded-xl bg-emerald-400/10 px-2 py-3 text-emerald-200">1. Тариф выбран</div>
          <div className="rounded-xl bg-cyan-400/10 px-2 py-3 text-cyan-200">2. Проверьте сумму</div>
          <div className="rounded-xl bg-white/5 px-2 py-3 text-slate-300">3. Оплатите</div>
        </div>
        {!plan ? (
          <section className="rounded-3xl border border-white/10 bg-white p-6 text-slate-900 dark:bg-slate-900 dark:text-white">
            <h2 className="text-xl font-semibold">Тариф недоступен</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Выберите актуальный тариф в кабинете.</p>
            <Link href="/dashboard/plans" className="mt-5 inline-flex font-semibold text-cyan-700 underline">Перейти к тарифам</Link>
          </section>
        ) : !yookassa ? (
          <section className="rounded-3xl border border-white/10 bg-white p-6 text-slate-900 dark:bg-slate-900 dark:text-white">
            <h2 className="text-xl font-semibold">Оплата в рублях пока недоступна</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">ЮKassa ещё не подключена в настройках кабинета.</p>
          </section>
        ) : (
          <section className="rounded-3xl border border-white/10 bg-white p-5 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-white sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-700">Счёт AlekseevVP</p>
            <h2 className="mt-2 text-2xl font-bold">{plan.name}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{plan.unlimitedDuration ? 'Бессрочный доступ' : `${plan.durationDays} дней доступа`}. Устройства и скидки учтём перед переходом к оплате.</p>
            <div className="mt-6"><PlanCard {...plan} display="checkout" paymentProviders={[yookassa]} /></div>
            <p className="mt-5 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">Платёж обрабатывает ЮKassa. Доступные способы, включая СБП, зависят от настроек магазина и покажутся на её странице. Статус заказа появится в кабинете.</p>
          </section>
        )}
        <p className="mt-6 text-center text-xs text-slate-400">Перед оплатой проверьте, что вошли в тот же аккаунт, который привязан к боту. Подписка и история платежей хранятся в кабинете AlekseevVP.</p>
      </div>
    </main>
  )
}
