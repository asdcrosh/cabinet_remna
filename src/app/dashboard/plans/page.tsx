// /dashboard/plans — выбор тарифа. Серверный компонент: планы
// подтянем напрямую из Prisma (не из /api/plans, чтобы не ходить самому к себе).

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { PlanCard } from '@/components/dashboard/plan-card'
import { formatPrice } from '@/lib/format'
import { PageHeader } from '@/components/dashboard/page-header'
import { getCurrentUser } from '@/lib/auth/cookies'
import { CheckCircle2, CreditCard, KeyRound, ShieldCheck } from 'lucide-react'

export const revalidate = 300 // кэш на 5 минут

export default async function PlansPage() {
  const session = await getCurrentUser()
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
  const usedTrialPlanIds = session
    ? new Set(
        (
          await prisma.trialPlanRedemption.findMany({
            where: { userId: session.uid },
            select: { planId: true },
          })
        ).map((redemption) => redemption.planId)
      )
    : new Set<string>()
  const visiblePlans = plans.filter((plan) => !plan.isPromo || !usedTrialPlanIds.has(plan.id))
  const currentSubscription = session
    ? await prisma.subscription.findFirst({
        where: { userId: session.uid, status: { in: ['ACTIVE', 'LIMITED'] } },
        orderBy: { expireAt: 'desc' },
      })
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Купить VPN"
        description="Выберите тариф и оплатите онлайн"
        action={session?.role === 'ADMIN' ? (
          <Link href="/dashboard/admin/plans" className="btn-secondary">
            Управлять тарифами
          </Link>
        ) : undefined}
      />

      <section className="card relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-brand-500" />
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Тарифы для стабильного VPN</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              После оплаты доступ появится в кабинете: QR-код, ссылка подписки и продление.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <BuyStep icon={<ShieldCheck className="h-5 w-5" />} title="1. Тариф" text="Выберите срок и лимиты" />
            <BuyStep icon={<CreditCard className="h-5 w-5" />} title="2. Оплата" text="Оплатите картой онлайн" />
            <BuyStep icon={<KeyRound className="h-5 w-5" />} title="3. Доступ" text="Откройте ключи в кабинете" />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visiblePlans.length === 0 && (
          <div className="card col-span-full py-12 text-center">
            <h3 className="text-lg font-semibold">Тарифы скоро появятся</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
              Сейчас нет опубликованных тарифов.
            </p>
            {session?.role === 'ADMIN' && (
              <Link href="/dashboard/admin/plans" className="btn-primary mt-5 inline-flex">
                Создать тариф
              </Link>
            )}
          </div>
        )}
        {visiblePlans.map((p, index) => (
          <PlanCard
            key={p.id}
            id={p.id}
            name={p.name}
            description={p.description}
            price={formatPrice(p.priceKopecks)}
            durationDays={p.durationDays}
            trafficLimitGb={p.trafficLimitGb}
            deviceLimit={p.deviceLimit}
            isPromo={p.isPromo}
            popular={index === 1}
            current={currentSubscription?.planId === p.id}
          />
        ))}
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <TrustItem title="Email-аккаунт" text="Покупка и продление доступны в личном кабинете." />
        <TrustItem title="Быстрый доступ" text="Ключи и QR-код появятся в личном кабинете." />
        <TrustItem title="Устройства" text="Смотрите подключения и отвязывайте лишнее." />
      </section>
    </div>
  )
}

function BuyStep({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-surface-800/70">
      <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-slate-950 text-cyan-200 dark:bg-white dark:text-slate-950">
        {icon}
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{text}</p>
    </div>
  )
}

function TrustItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-white/70 bg-white/60 p-4 shadow-sm shadow-slate-200/40 backdrop-blur dark:border-white/10 dark:bg-surface-900/50 dark:shadow-black/20">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
      <div>
        <div className="font-medium">{title}</div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{text}</p>
      </div>
    </div>
  )
}
