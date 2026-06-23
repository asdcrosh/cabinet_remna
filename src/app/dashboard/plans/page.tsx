// /dashboard/plans — выбор тарифа. Серверный компонент: планы
// подтянем напрямую из Prisma (не из /api/plans, чтобы не ходить самому к себе).

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { PlanCard } from '@/components/dashboard/plan-card'
import { formatPrice } from '@/lib/format'
import { PageHeader } from '@/components/dashboard/page-header'
import { getCurrentUser } from '@/lib/auth/cookies'
import { CheckCircle2, CreditCard, KeyRound, ShieldCheck } from 'lucide-react'
import { getPlanAudienceContext, isPlanAvailableForUser } from '@/lib/plan-access'

export const revalidate = 300 // кэш на 5 минут

export default async function PlansPage({
  searchParams,
}: {
  searchParams?: { plan?: string }
}) {
  const session = await getCurrentUser()
  const linkedPlanId = searchParams?.plan?.trim()
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
  const user = session
    ? await prisma.user.findUnique({
        where: { id: session.uid },
        select: {
          role: true,
          telegramId: true,
          remnashopUserId: true,
          remnashopSyncedAt: true,
          remnawaveUuid: true,
        },
      })
    : null
  const canManagePlans = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const audienceContext = session ? await getPlanAudienceContext(session.uid) : null
  const usedTrialPlanIds = session
    ? new Set(
        (
          await prisma.trialPlanRedemption.findMany({
            where: {
              userId: session.uid,
              payment: { subscriptionProvisionedAt: { not: null } },
            },
            select: { planId: true },
          })
        ).map((redemption) => redemption.planId)
      )
    : new Set<string>()
  const currentSubscription = session
    ? await prisma.subscription.findFirst({
        where: { userId: session.uid, status: { in: ['ACTIVE', 'LIMITED'] } },
        orderBy: { expireAt: 'desc' },
      })
    : null
  const hasAnySubscription = session
    ? (await prisma.subscription.count({ where: { userId: session.uid } })) > 0
    : false
  const canUsePromo =
    Boolean(user?.telegramId) &&
    Boolean(user?.remnashopSyncedAt) &&
    !usedTrialPlanIds.size &&
    !hasAnySubscription &&
    !user?.remnashopUserId &&
    !user?.remnawaveUuid
  const audiencePlans = audienceContext
    ? plans.filter((plan) =>
        isPlanAvailableForUser(plan, audienceContext, {
          allowLink: plan.availability === 'LINK' && plan.id === linkedPlanId,
        })
      )
    : plans.filter((plan) => plan.availability === 'ALL')
  const visiblePlans = audiencePlans.filter((plan) => !plan.isPromo || canUsePromo)
  const hasPromoPlan = audiencePlans.some((plan) => plan.isPromo)
  const isOtherwiseEligibleForPromo =
    !usedTrialPlanIds.size &&
    !hasAnySubscription &&
    !user?.remnashopUserId &&
    !user?.remnawaveUuid
  const needsTelegramCheckForPromo =
    hasPromoPlan &&
    isOtherwiseEligibleForPromo &&
    (!user?.telegramId || !user?.remnashopSyncedAt)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Купить VPN"
        description="Выберите тариф и оплатите онлайн"
        action={canManagePlans ? (
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
            <BuyStep icon={<KeyRound className="h-5 w-5" />} title="3. Подключение" text="Добавьте подписку по QR-коду" />
          </div>
        </div>
      </section>

      {needsTelegramCheckForPromo && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <span>Пробный тариф откроется после проверки Telegram.</span>
          <Link href="/dashboard/settings" className="btn-secondary h-10 shrink-0 px-4 text-sm">
            Проверить Telegram
          </Link>
        </div>
      )}

      <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visiblePlans.length === 0 && (
          <div className="card col-span-full py-12 text-center">
            <h3 className="text-lg font-semibold">Тарифы скоро появятся</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
              Сейчас нет опубликованных тарифов.
            </p>
            {canManagePlans && (
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
        <TrustItem title="Быстрый доступ" text="Ссылка подписки и QR-код появятся в кабинете." />
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
