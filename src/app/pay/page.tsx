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
    <main className="min-h-[100dvh] bg-[#101820] px-4 py-6 text-slate-100 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
          <p className="text-sm font-bold tracking-[0.16em] text-white">{getBrandName()}</p>
          <Link href="/dashboard/plans" className="rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white active:scale-[0.98]">Все тарифы</Link>
        </header>
        <div className="grid gap-8 pt-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-12 md:pt-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Оплата подписки</p>
            <h1 className="mt-4 max-w-md text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Один тариф. Один аккаунт. Все устройства.</h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">Выберите параметры и проверьте сумму. После создания счёта откроется защищённая страница ЮKassa.</p>
            <ol className="mt-9 border-l border-white/15 pl-5 text-sm md:mt-14">
              <li className="relative pb-7 text-slate-300 before:absolute before:-left-[1.48rem] before:top-1 before:h-2 before:w-2 before:rounded-full before:bg-teal-300">Тариф выбран</li>
              <li className="relative pb-7 font-semibold text-white before:absolute before:-left-[1.48rem] before:top-1 before:h-2 before:w-2 before:rounded-full before:bg-teal-300">Проверьте сумму</li>
              <li className="relative text-slate-400 before:absolute before:-left-[1.48rem] before:top-1 before:h-2 before:w-2 before:rounded-full before:border before:border-slate-500">Оплатите на сайте ЮKassa</li>
            </ol>
          </div>
          <div>
        {!plan ? (
          <section className="rounded-2xl border border-slate-200 bg-[#f8faf9] p-6 text-slate-900 dark:border-white/10 dark:bg-[#17232d] dark:text-white">
            <h2 className="text-xl font-semibold">Тариф недоступен</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Выберите актуальный тариф в кабинете.</p>
            <Link href="/dashboard/plans" className="mt-5 inline-flex font-semibold text-teal-800 underline underline-offset-4 dark:text-teal-300">Перейти к тарифам</Link>
          </section>
        ) : !yookassa ? (
          <section className="rounded-2xl border border-slate-200 bg-[#f8faf9] p-6 text-slate-900 dark:border-white/10 dark:bg-[#17232d] dark:text-white">
            <h2 className="text-xl font-semibold">Оплата в рублях пока недоступна</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">ЮKassa ещё не подключена в настройках кабинета.</p>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-[#f8faf9] p-5 text-slate-950 shadow-[0_20px_50px_-25px_rgba(0,0,0,0.35)] dark:border-white/10 dark:bg-[#17232d] dark:text-white sm:p-8">
            <div className="border-b border-slate-200 pb-5 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-[0.17em] text-teal-800 dark:text-teal-300">Ваш заказ</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">{plan.name}</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{plan.unlimitedDuration ? 'Бессрочный доступ' : `${plan.durationDays} дней доступа`}. Устройства и скидки учтём в итоговой сумме.</p>
            </div>
            <div className="mt-5"><PlanCard {...plan} display="checkout" paymentProviders={[yookassa]} receiptOnCreate /></div>
            <p className="mt-5 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500 dark:border-white/10 dark:text-slate-400">Способы оплаты, включая СБП, покажет ЮKassa. Статус заказа сохранится в кабинете.</p>
          </section>
        )}
          </div>
        </div>
        <p className="mt-10 max-w-2xl border-t border-white/10 pt-5 text-xs leading-5 text-slate-400">Проверьте аккаунт перед оплатой: подписка и история платежей появятся у пользователя кабинета, в который вы вошли.</p>
      </div>
    </main>
  )
}
