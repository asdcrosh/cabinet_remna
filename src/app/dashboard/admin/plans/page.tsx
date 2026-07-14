import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { PageHeader } from '@/components/dashboard/page-header'
import { PlansAdmin, type PlanAdminRow } from '@/components/admin/plans-admin'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Тарифы — Админка' }

export default async function AdminPlansPage() {
  await requireAdminPage()

  const plans = await prisma.plan.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    include: {
      _count: {
        select: {
          payments: true,
          subscriptions: true,
        },
      },
    },
  })

  const rows: PlanAdminRow[] = plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    priceKopecks: plan.priceKopecks,
    durationDays: plan.durationDays,
    trafficLimitGb: plan.trafficLimitGb,
    deviceLimit: plan.deviceLimit,
    activeInternalSquads: plan.activeInternalSquads,
    availability: plan.availability,
    allowedEmails: plan.allowedEmails,
    allowedTelegramIds: plan.allowedTelegramIds,
    isPromo: plan.isPromo,
    isFeatured: plan.isFeatured,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    paymentsCount: plan._count.payments,
    subscriptionsCount: plan._count.subscriptions,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Тарифы"
        description="Цены, лимиты, серверные группы и аудитория каждого тарифа"
      />
      <PlansAdmin plans={rows} />
    </div>
  )
}
