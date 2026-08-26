import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
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
    unlimitedDuration: plan.unlimitedDuration,
    trafficLimitGb: plan.trafficLimitGb,
    deviceLimit: plan.deviceLimit,
    unlimitedDevices: plan.unlimitedDevices,
    maxDeviceLimit: plan.maxDeviceLimit,
    deviceAddonEnabled: plan.deviceAddonEnabled,
    extraDevicePriceKopecks: plan.extraDevicePriceKopecks,
    activeInternalSquads: plan.activeInternalSquads,
    whitelistAddonEnabled: plan.whitelistAddonEnabled,
    whitelistAddonPriceKopecks: plan.whitelistAddonPriceKopecks,
    whitelistAddonInternalSquads: plan.whitelistAddonInternalSquads,
    availability: plan.availability,
    allowedEmails: plan.allowedEmails,
    allowedTelegramIds: plan.allowedTelegramIds,
    isPromo: plan.isPromo,
    promoCodesEnabled: plan.promoCodesEnabled,
    isFeatured: plan.isFeatured,
    isActive: plan.isActive,
    paymentsCount: plan._count.payments,
    subscriptionsCount: plan._count.subscriptions,
  }))

  return (
    <AdminPageShell
      title="Тарифы"
      description="Каталог, ограничения и серверные группы"
    >
      <PlansAdmin plans={rows} />
    </AdminPageShell>
  )
}
