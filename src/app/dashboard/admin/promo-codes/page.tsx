import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { PageHeader } from '@/components/dashboard/page-header'
import { PromoCodesAdmin, type PromoCodeAdminRow } from '@/components/admin/promo-codes-admin'
import { LazyListLoader } from '@/components/admin/lazy-list-loader'
import { ADMIN_LIST_PAGE_SIZE, parseAdminListLimit } from '@/lib/admin-list'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Промокоды — Админка' }

export default async function AdminPromoCodesPage({
  searchParams,
}: {
  searchParams?: { limit?: string }
}) {
  await requireAdminPage()
  const limit = parseAdminListLimit(searchParams?.limit)

  const [total, promoCodes, plans] = await Promise.all([
    prisma.promoCode.count(),
    prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        plans: { include: { plan: true }, orderBy: { plan: { sortOrder: 'asc' } } },
        redemptions: { select: { status: true } },
      },
    }),
    prisma.plan.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ])

  const rows: PromoCodeAdminRow[] = promoCodes.map((promoCode) => {
    const reservedCount = promoCode.redemptions.filter((redemption) =>
      ['PENDING', 'SUCCEEDED'].includes(redemption.status)
    ).length

    return {
      id: promoCode.id,
      code: promoCode.code,
      discountPercent: promoCode.discountPercent,
      isActive: promoCode.isActive,
      startsAt: promoCode.startsAt?.toISOString() ?? null,
      expiresAt: promoCode.expiresAt?.toISOString() ?? null,
      maxUses: promoCode.maxUses,
      maxUsesPerUser: promoCode.maxUsesPerUser,
      usedCount: promoCode.redemptions.filter((redemption) => redemption.status === 'SUCCEEDED').length,
      reservedCount,
      planIds: promoCode.plans.map((promoPlan) => promoPlan.planId),
      planNames: promoCode.plans.map((promoPlan) => promoPlan.plan.name),
    }
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Промокоды"
        description="Процентные скидки, сроки действия, лимиты и привязка к тарифам"
      />
      <PromoCodesAdmin
        promoCodes={rows}
        plans={plans.map((plan) => ({ id: plan.id, name: plan.name }))}
      />
      <LazyListLoader loaded={promoCodes.length} total={total} step={ADMIN_LIST_PAGE_SIZE} />
    </div>
  )
}
