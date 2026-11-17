// Подписка, продление и история платежей.

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/dashboard/page-header'
import { PaymentSuccessBanner } from '@/components/dashboard/payment-success-banner'
import { PaymentHistory } from '@/components/dashboard/payment-history'
import { readPaymentBannerStatus } from '@/lib/payment-status-read'
import { getFeatureFlags } from '@/lib/feature-flags'
import { ArrowRight, CreditCard, Tag } from 'lucide-react'
import { AutoRenewalCard } from '@/components/dashboard/auto-renewal-card'
import { getAutoRenewalState } from '@/lib/auto-renewal'
import { getRetentionState } from '@/lib/subscription-retention'
import { tryCalculateRenewalPricing } from '@/lib/renewal-pricing'
import type { Prisma } from '@prisma/client'
import { resolveSubscriptionPresentation } from '@/lib/subscription-presentation'
import { BillingOverview } from '@/components/dashboard/billing-overview'
import { isWhitelistAddonCurrentlyActive } from '@/lib/whitelist-addon-policy'
import { buildDeviceAddonOffer, buildWhitelistAddonOffer } from '@/lib/subscription-addon-offers'
import { getAvailablePaymentProviders } from '@/lib/payment-providers'
import { getAvailableUserPromoCodesByPlan, type AvailableUserPromoCode } from '@/lib/user-promo-codes'
import { HomeWhitelistAddon } from '@/components/dashboard/home-whitelist-addon'
import { HomeDeviceAddon } from '@/components/dashboard/home-device-addon'
import { formatPrice } from '@/lib/format'

export const dynamic = 'force-dynamic'
const PAGE_SIZE = 20
type PaymentView = 'important' | 'succeeded' | 'canceled' | 'all'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; payment?: string; page?: string; view?: string }>
}) {
  const params = await searchParams
  const features = await getFeatureFlags()
  const session = await getCurrentUser()
  if (!session) redirect('/login?next=/dashboard/billing')
  const returnPaymentId = typeof params.payment === 'string' ? params.payment : null
  const requestedPage = Number(params.page)
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const view: PaymentView = ['succeeded', 'canceled', 'all'].includes(params.view ?? '')
    ? params.view as PaymentView
    : 'important'
  const paymentWhere: Prisma.PaymentWhereInput = {
    userId: session.uid,
    ...(view === 'important'
      ? { status: { in: ['SUCCEEDED', 'REFUNDED', 'PENDING'] } }
      : view === 'succeeded'
        ? { status: { in: ['SUCCEEDED', 'REFUNDED'] } }
        : view === 'canceled'
          ? { status: 'CANCELED' }
          : {}),
  }
  const paymentBannerStatus =
    params.paid === '1' && returnPaymentId
      ? await readPaymentBannerStatus(returnPaymentId, session.uid)
      : null
  const [[total, payments, currentSubscription], autoRenewal, retentionPause, discountUser] = await Promise.all([
    prisma.$transaction([
      prisma.payment.count({ where: paymentWhere }),
      prisma.payment.findMany({
        where: paymentWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { plan: true, subscription: true },
      }),
      prisma.subscription.findFirst({
        where: { userId: session.uid },
        orderBy: { expireAt: 'desc' },
        include: {
          plan: {
            select: {
              id: true,
              name: true,
              priceKopecks: true,
              durationDays: true,
              unlimitedDuration: true,
              unlimitedDevices: true,
              isActive: true,
              isPromo: true,
              whitelistAddonEnabled: true,
              whitelistAddonPriceKopecks: true,
              whitelistAddonInternalSquads: true,
              deviceLimit: true,
              maxDeviceLimit: true,
              extraDevicePriceKopecks: true,
              deviceAddonEnabled: true,
              promoCodesEnabled: true,
            },
          },
        },
      }),
    ]),
    getAutoRenewalState(session.uid),
    getRetentionState(session.uid),
    prisma.user.findUnique({
      where: { id: session.uid },
      select: { personalDiscountPercent: true },
    }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (page > pages) redirect(billingHref(view, pages))
  const subscriptionState = currentSubscription
    ? resolveSubscriptionPresentation({
        localStatus: currentSubscription.status,
        localExpireAt: currentSubscription.expireAt,
        graceExpireAt: currentSubscription.graceExpireAt,
        unlimitedDuration: currentSubscription.plan?.unlimitedDuration,
        pendingSync: currentSubscription.pendingSync,
      })
    : null

  const plan = currentSubscription?.plan
  const renewalPlan = plan ?? autoRenewal?.plan
  const deviceLimit = currentSubscription?.deviceLimit ?? plan?.deviceLimit ?? null
  const includesAddon = Boolean(currentSubscription && plan
    && isWhitelistAddonCurrentlyActive(currentSubscription)
    && plan.whitelistAddonEnabled && plan.whitelistAddonPriceKopecks > 0
    && plan.whitelistAddonInternalSquads.length > 0)
  const renewalPrice = plan && deviceLimit != null
    ? tryCalculateRenewalPricing(plan, deviceLimit, discountUser?.personalDiscountPercent ?? 0, includesAddon ? plan.whitelistAddonPriceKopecks : 0)?.totalAmountKopecks ?? null
    : null
  const canManageActiveSubscription = Boolean(currentSubscription
    && ['ACTIVE', 'LIMITED'].includes(currentSubscription.status)
    && currentSubscription.expireAt > new Date())

  const v2 = features.newDesign
  // Новый дизайн: без подписки и без платежей раздел сразу открывает выбор тарифа.
  if (v2 && !currentSubscription && total === 0 && view === 'important' && !returnPaymentId) {
    redirect('/dashboard/plans')
  }
  const [paymentProviders, promoCodesByPlan]: [
    Awaited<ReturnType<typeof getAvailablePaymentProviders>>,
    Map<string, AvailableUserPromoCode[]>,
  ] = v2 && currentSubscription && plan
    ? await Promise.all([
        getAvailablePaymentProviders(),
        getAvailableUserPromoCodesByPlan({ userId: session.uid, plans: [plan] })
          .catch(() => new Map<string, AvailableUserPromoCode[]>()),
      ])
    : [[], new Map()]
  const whitelistAddonOffer = v2 && currentSubscription && subscriptionState
    ? buildWhitelistAddonOffer({
        subscriptions: [currentSubscription],
        usable: subscriptionState.usable,
        effectiveExpireAt: subscriptionState.expireAt,
      })
    : null
  const deviceAddonOffer = v2 && currentSubscription && subscriptionState
    ? buildDeviceAddonOffer({
        subscription: currentSubscription,
        usable: subscriptionState.usable,
        expireAt: subscriptionState.expireAt ?? currentSubscription.expireAt,
      })
    : null
  const promoCodes = plan ? promoCodesByPlan.get(plan.id) ?? [] : []

  return (
    <div className="user-workspace page-stack mx-auto max-w-6xl" data-design={v2 ? 'v2' : undefined}>
      <PageHeader
        title={v2 ? 'Подписка' : 'Подписка и оплата'}
        description={v2 ? 'Тариф и срок, продление, дополнения и платежи.' : 'Срок доступа, продление и все ваши платежи.'}
      />

      {params.paid === '1' && returnPaymentId && (
        <PaymentSuccessBanner
          key={`${returnPaymentId}:${paymentBannerStatus}`}
          paymentId={returnPaymentId}
          status={paymentBannerStatus ?? 'not_found'}
          supportEnabled={features.support}
        />
      )}

      {currentSubscription && subscriptionState ? (
        <BillingOverview
          planName={plan?.name ?? 'VPN-подписка'}
          state={subscriptionState}
          unlimitedDuration={Boolean(plan?.unlimitedDuration)}
          unlimitedDevices={Boolean(plan?.unlimitedDevices)}
          deviceLimit={deviceLimit}
          renewalPrice={renewalPrice}
          durationDays={plan?.durationDays ?? null}
          includesAddon={includesAddon}
        />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.025] sm:p-6">
          <h2 className="text-xl font-semibold">Подписки пока нет</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">Выберите тариф. После подтверждения оплаты здесь появятся срок доступа и условия продления.</p>
          <Link href="/dashboard/plans" className="btn-primary mt-4 w-full sm:w-auto"><CreditCard className="h-4 w-4" />Выбрать тариф</Link>
        </section>
      )}

      {whitelistAddonOffer || deviceAddonOffer ? (
        <section aria-labelledby="addons-title" className="space-y-3">
          <h2 id="addons-title" className="px-1 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Дополнения</h2>
          {whitelistAddonOffer ? <HomeWhitelistAddon {...whitelistAddonOffer} paymentProviders={paymentProviders} /> : null}
          {deviceAddonOffer ? <HomeDeviceAddon {...deviceAddonOffer} paymentProviders={paymentProviders} /> : null}
        </section>
      ) : null}

      {v2 && plan && promoCodes.length > 0 ? (
        <section aria-labelledby="promo-codes-title" className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/20 dark:bg-amber-400/[0.06] sm:p-5">
          <h2 id="promo-codes-title" className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
            <Tag className="h-4 w-4 text-amber-600 dark:text-amber-300" />
            {promoCodes.length === 1 ? 'У вас есть промокод' : 'Ваши промокоды'}
          </h2>
          <ul className="mt-3 space-y-2">
            {promoCodes.map((promo) => (
              <li key={promo.code} className="flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3 dark:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold text-slate-950 dark:text-white">{promo.code}</div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    −{promo.discountPercent}% на продление «{plan.name}» · {formatPrice(promo.finalAmountKopecks)} вместо {formatPrice(promo.finalAmountKopecks + promo.discountKopecks)}
                  </div>
                </div>
                <Link
                  href={`/dashboard/plans?plan=${encodeURIComponent(plan.id)}&promo=${encodeURIComponent(promo.code)}&intent=renew`}
                  className="btn-primary w-full shrink-0 justify-center sm:w-auto"
                >
                  Применить <ArrowRight className="h-4 w-4" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {renewalPlan && (!renewalPlan.unlimitedDuration || autoRenewal || retentionPause) ? (
        <AutoRenewalCard
          planId={renewalPlan.id}
          planName={renewalPlan.name}
          planPriceKopecks={renewalPrice}
          planDurationDays={renewalPlan.durationDays}
          planDeviceLimit={deviceLimit ?? autoRenewal?.deviceLimit ?? renewalPlan.deviceLimit}
          accessExpiresAt={currentSubscription?.expireAt.toISOString() ?? null}
          canPause={canManageActiveSubscription && !plan?.unlimitedDuration}
          canEnable={canManageActiveSubscription && Boolean(plan?.isActive && !plan.isPromo && !plan.unlimitedDuration && plan.priceKopecks > 0)}
          initialState={autoRenewal ? {
            ...autoRenewal,
            paymentMethodSavedAt: autoRenewal.paymentMethodSavedAt?.toISOString() ?? null,
            consentAcceptedAt: autoRenewal.consentAcceptedAt?.toISOString() ?? null,
            nextChargeAt: autoRenewal.nextChargeAt?.toISOString() ?? null,
            lastAttemptAt: autoRenewal.lastAttemptAt?.toISOString() ?? null,
            lastSuccessAt: autoRenewal.lastSuccessAt?.toISOString() ?? null,
          } : null}
          initialPause={retentionPause ? {
            ...retentionPause,
            pauseUntil: retentionPause.pauseUntil?.toISOString() ?? null,
            createdAt: retentionPause.createdAt.toISOString(),
          } : null}
        />
      ) : null}

      <section aria-labelledby="payment-history-title">
        <div className="mb-3 flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="payment-history-title" className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
              История операций
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {total === 0 ? 'Покупок пока нет' : `${total} ${paymentCountLabel(total)}`}
            </p>
          </div>
          <nav className="flex max-w-full gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Фильтр платежей">
            {([
              ['important', 'Важные'],
              ['succeeded', 'Оплаченные'],
              ['canceled', 'Отменённые'],
              ['all', 'Все'],
            ] as const).map(([value, label]) => (
              <Link
                key={value}
                href={billingHref(value, 1)}
                aria-current={view === value ? 'page' : undefined}
                className={view === value
                  ? 'min-w-fit rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-950'
                  : 'min-w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/10'}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        {view === 'important' ? (
          <p className="mb-3 px-1 text-xs text-slate-500 dark:text-slate-400">Отменённые попытки оплаты скрыты. Они доступны во вкладке «Все».</p>
        ) : null}
        <PaymentHistory payments={payments} supportEnabled={features.support} filtered={view !== 'important'} />
      </section>

      {pages > 1 && (
        <nav className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 dark:border-white/[0.09] dark:bg-white/[0.03] sm:gap-3" aria-label="Страницы платежей">
          {page > 1
            ? <Link href={billingHref(view, page - 1)} className="btn-secondary min-h-10 justify-self-start px-3 py-2">Назад</Link>
            : <span />}
          <span className="text-center text-xs font-medium text-slate-500 sm:text-sm">{Math.min(page, pages)} из {pages}</span>
          {page < pages
            ? <Link href={billingHref(view, page + 1)} className="btn-secondary min-h-10 justify-self-end px-3 py-2">Дальше</Link>
            : <span />}
        </nav>
      )}
    </div>
  )
}

function billingHref(view: PaymentView, page: number) {
  const params = new URLSearchParams()
  if (view !== 'important') params.set('view', view)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/dashboard/billing?${query}` : '/dashboard/billing'
}

function paymentCountLabel(count: number) {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 14) return 'платежей'
  if (mod10 === 1) return 'платёж'
  if (mod10 >= 2 && mod10 <= 4) return 'платежа'
  return 'платежей'
}
