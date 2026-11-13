import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PaymentSuccessBanner } from '@/components/dashboard/payment-success-banner'
import { getCurrentUser } from '@/lib/auth/cookies'
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
    <main className="min-h-dvh bg-slate-950 px-4 py-8 text-white sm:py-14">
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">AlekseevVP</p>
        <h1 className="mb-6 mt-2 text-3xl font-bold">Счёт за подписку</h1>
        <section className="rounded-3xl border border-white/10 bg-white p-6 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-white sm:p-8">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-5 dark:border-white/10">
            <div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Заказ</p><p className="mt-1 font-mono text-xs">{payment.id}</p></div>
            <p className="text-right text-xs text-slate-500 dark:text-slate-400">{payment.createdAt.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}</p>
          </div>
          <div className="mt-5 flex justify-between gap-3 text-sm"><span className="text-slate-600 dark:text-slate-300">Тариф</span><strong className="text-right">{payment.plan.name}</strong></div>
          <div className="mt-5 flex justify-between gap-3 border-t border-dashed border-slate-300 pt-5 dark:border-white/20"><span className="text-sm font-semibold">К оплате</span><strong className="text-2xl tabular-nums">{formatPrice(payment.amountKopecks)}</strong></div>
          {payment.status === 'PENDING' && payment.confirmationUrl ? (
            <a href={payment.confirmationUrl} referrerPolicy="no-referrer" className="mt-7 flex min-h-14 items-center justify-center rounded-2xl bg-slate-950 px-5 text-center font-semibold text-white transition hover:bg-slate-800 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300">
              Перейти к оплате через ЮKassa
            </a>
          ) : null}
          <p className="mt-4 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">На странице ЮKassa выберите доступный способ. Для СБП на компьютере она покажет QR-код, на телефоне предложит банк.</p>
        </section>
        <div className="mt-5"><PaymentSuccessBanner paymentId={payment.id} status={status} /></div>
        <div className="mt-6 flex justify-center gap-5 text-sm text-slate-300"><Link href="/dashboard/billing" className="underline underline-offset-4">История платежей</Link><Link href="/dashboard/plans" className="underline underline-offset-4">Тарифы</Link></div>
      </div>
    </main>
  )
}
