// /dashboard/plans — выбор тарифа. Серверный компонент: планы
// подтянем напрямую из Prisma (не из /api/plans, чтобы не ходить самому к себе).

import Link from 'next/link'
import { PlanCatalog } from '@/components/dashboard/mobile-plan-picker'
import { PageHeader } from '@/components/dashboard/page-header'
import { getCurrentUser } from '@/lib/auth/cookies'
import { buildPlanCatalog } from '@/lib/plan-catalog'
import { ArrowRight, MessageCircleQuestion, RefreshCw, ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; promo?: string; intent?: string; whitelistAddon?: string }>
}) {
  const params = await searchParams
  const session = await getCurrentUser()
  const linkedPlanId = params.plan?.trim()
  const initialPromoCode = params.promo?.trim()
  const isRenewIntent = params.intent === 'renew'
  const {
    plans: planViews,
    canManagePlans,
    currentSubscription,
    currentDeviceLimit,
    needsTelegramCheckForPromo,
    autoRenewal,
    autoRenewalAvailable,
    autoRenewalConsentCurrent,
    activeAutoRenewal,
  } = await buildPlanCatalog({
    userId: session?.uid ?? null,
    linkedPlanId,
    initialPromoCode,
    whitelistAddonRequested: params.whitelistAddon === 'true',
  })
  const currentPlanName = currentSubscription?.plan?.name ?? null

  return (
    <div className="user-workspace page-stack">
      <PageHeader
        title="Тарифы"
        description="Выберите тариф и настройте подписку под свои устройства."
        action={(
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {canManagePlans && (
              <>
                <Link href="/dashboard/admin/plans" className="hidden xl:inline-flex btn-secondary">
                  Управлять тарифами
                </Link>
                <Link href="/dashboard/admin/plans" className="inline-flex min-h-9 items-center text-sm font-medium text-slate-500 transition-colors hover:text-slate-950 dark:text-slate-400 dark:hover:text-white xl:hidden">
                  Управление
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </>
            )}
          </div>
        )}
      />

      {currentSubscription ? (
        <section aria-label="Текущая подписка" className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><ShieldCheck className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Текущая подписка</p>
              <h2 className="mt-1 break-words text-lg font-semibold">{currentPlanName ?? 'VPN-подписка'}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {currentSubscription.plan?.unlimitedDuration ? 'Бессрочно' : `Оплачено до ${currentSubscription.expireAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' })}`}
                {' · '}{currentSubscription.plan?.unlimitedDevices ? 'Безлимит устройств' : `До ${currentDeviceLimit ?? currentSubscription.plan?.deviceLimit ?? '—'} устройств`}
              </p>
            </div>
          </div>
          <Link href="/dashboard/billing" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold">Подписка и платежи <ArrowRight className="h-4 w-4" /></Link>
        </section>
      ) : null}

      {isRenewIntent ? (
        <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
          При продлении текущего тарифа дни добавятся к подписке. При переходе на другой тариф начнётся новый срок, оставшиеся дни не переносятся.
        </p>
      ) : null}

      {needsTelegramCheckForPromo && (
        <div className="relative flex items-center gap-3 overflow-hidden rounded-[1.25rem] border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50/70 p-4 text-sm text-slate-800 shadow-[0_12px_32px_-25px_rgba(217,119,6,0.5)] dark:border-amber-400/15 dark:from-amber-500/[0.09] dark:via-white/[0.025] dark:to-orange-500/[0.05] dark:text-slate-100">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/15 dark:text-amber-200">
              <MessageCircleQuestion className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">Доступен пробный тариф</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">Подтвердите аккаунт через Telegram</span>
            </span>
          </span>
          <Link href="/dashboard/settings" aria-label="Перейти к проверке аккаунта" className="ml-auto inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 px-1 font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:decoration-cyan-500 dark:text-slate-100 dark:decoration-white/20 sm:px-3">
            <span className="hidden sm:inline">Проверить</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {planViews.length > 0 ? (
        <PlanCatalog
          key={`${currentSubscription?.planId ?? 'none'}:${currentDeviceLimit ?? 'unknown'}:${linkedPlanId ?? ''}:${params.whitelistAddon ?? ''}`}
          plans={planViews}
          initialPlanId={linkedPlanId}
        />
      ) : null}

      {autoRenewalAvailable ? (
        <section className="relative flex flex-col gap-3 overflow-hidden rounded-[1.25rem] border border-slate-200/80 bg-white p-4 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.45)] dark:border-white/[0.09] dark:bg-white/[0.035] sm:flex-row sm:items-center sm:justify-between" aria-label="Автопродление">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-violet-500/[0.07] to-transparent dark:from-violet-400/[0.08]" />
          <div className="flex min-w-0 items-start gap-3">
            <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/15 dark:text-violet-300">
              <RefreshCw className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Автопродление</h2>
                <span className={activeAutoRenewal ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300' : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-white/[0.06] dark:text-slate-400'}>
                  {activeAutoRenewal ? 'Включено' : autoRenewalConsentCurrent ? 'Ожидает оплаты' : 'По желанию'}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {activeAutoRenewal
                  ? `Тариф «${autoRenewal?.plan.name}» продлится автоматически. Управление доступно в разделе платежей.`
                  : autoRenewalConsentCurrent
                    ? 'Завершите оплату картой через ЮKassa, чтобы сохранить способ оплаты.'
                    : 'Вы сможете включить его в окне подтверждения после выбора тарифа.'}
              </p>
            </div>
          </div>
          {autoRenewalConsentCurrent ? (
            <Link href="/dashboard/billing" className="inline-flex min-h-9 shrink-0 items-center gap-1.5 self-start text-sm font-semibold text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white sm:self-auto">
              Управлять <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </section>
      ) : null}

      {planViews.length === 0 && (
        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white px-4 py-10 text-center shadow-sm dark:border-white/15 dark:bg-white/[0.025] sm:px-6 sm:py-12">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700 ring-1 ring-cyan-500/15 dark:text-cyan-200">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h3 className="text-lg font-semibold">Тарифы скоро появятся</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">Сейчас нет опубликованных тарифов.</p>
          {canManagePlans && (
            <Link href="/dashboard/admin/plans" className="btn-primary mt-5 inline-flex">Создать тариф</Link>
          )}
        </div>
      )}
    </div>
  )
}

