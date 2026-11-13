import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PaymentSuccessBanner } from '@/components/dashboard/payment-success-banner'
import { getCurrentUser } from '@/lib/auth/cookies'
import { getBrandName } from '@/lib/branding'
import { formatPrice } from '@/lib/format'
import { readPaymentBannerStatus } from '@/lib/payment-status-read'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Счёт за подписку' }

export default async function PaymentReceiptPage({ searchParams }: { searchParams: Promise<{ payment?: string | string[] }> }) {
  const rawPaymentId = (await searchParams).payment
  const paymentId = typeof rawPaymentId === 'string' && rawPaymentId.length <= 100 ? rawPaymentId : ''
  if (!paymentId) notFound()
  const session = await getCurrentUser()
  if (!session) redirect(`/login?next=${encodeURIComponent(`/pay/receipt?payment=${encodeURIComponent(paymentId)}`)}`)
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, userId: session.uid, provider: 'YOOKASSA' },
    select: { id: true, amountKopecks: true, confirmationUrl: true, status: true, createdAt: true,
      plan: { select: { name: true } } },
  })
  if (!payment) notFound()
  const status = await readPaymentBannerStatus(payment.id, session.uid)

  return (
    <main className="min-h-[100dvh] bg-[#101820] px-4 py-6 text-slate-100 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
          <p className="text-sm font-bold tracking-[0.16em] text-white">{getBrandName()}</p>
          <Link href="/dashboard/billing" className="rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white active:scale-[0.98]">Мои платежи</Link>
        </header>
        <div className="pb-7 pt-9 sm:pt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Заказ создан</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Счёт за подписку</h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">Сумма сохранена в кабинете. Выберите способ оплаты на защищённой странице ЮKassa.</p>
        </div>
        <section aria-label="Счёт" className="overflow-hidden rounded-2xl border border-slate-200 bg-[#f8faf9] text-slate-950 shadow-[0_20px_50px_-25px_rgba(0,0,0,0.35)] dark:border-white/10 dark:bg-[#17232d] dark:text-white">
          <div className="border-b border-dashed border-slate-300 p-6 dark:border-white/20 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.17em] text-teal-800 dark:text-teal-300">{getBrandName()} / счёт</p>
                <p className="mt-3 max-w-[17rem] break-all font-mono text-xs text-slate-500 dark:text-slate-400">{payment.id}</p>
              </div>
              <p className="shrink-0 text-right font-mono text-xs text-slate-500 dark:text-slate-400">{payment.createdAt.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}</p>
            </div>
            <div className="mt-8 flex justify-between gap-4 border-t border-slate-200 pt-5 text-sm dark:border-white/10">
              <span className="text-slate-600 dark:text-slate-300">Подписка</span>
              <strong className="text-right font-semibold">{payment.plan.name}</strong>
            </div>
            <div className="mt-5 flex items-end justify-between gap-4 border-t border-slate-200 pt-5 dark:border-white/10">
              <span className="pb-1 text-sm text-slate-600 dark:text-slate-300">К оплате</span>
              <strong className="text-right text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">{formatPrice(payment.amountKopecks)}</strong>
            </div>
          </div>
          <div className="p-6 sm:p-8">
          {payment.status === 'PENDING' && payment.confirmationUrl ? (
            <a href={payment.confirmationUrl} referrerPolicy="no-referrer" className="flex min-h-14 items-center justify-center rounded-xl bg-[#172b31] px-5 text-center font-semibold text-white transition-colors hover:bg-[#25444b] active:scale-[0.98] dark:bg-teal-300 dark:text-slate-950 dark:hover:bg-teal-200">
              Перейти к оплате через ЮKassa
            </a>
          ) : null}
          <p className="mt-4 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">Если магазин принимает СБП, на компьютере ЮKassa покажет QR-код, а на телефоне предложит выбрать банк.</p>
          </div>
        </section>
        <div className="mt-5"><PaymentSuccessBanner paymentId={payment.id} status={status} /></div>
        <div className="mt-7 flex flex-wrap gap-6 text-sm text-slate-300"><Link href="/dashboard/plans" className="underline underline-offset-4 hover:text-white">Другие тарифы</Link><Link href="/dashboard/support" className="underline underline-offset-4 hover:text-white">Помощь с оплатой</Link></div>
      </div>
    </main>
  )
}
