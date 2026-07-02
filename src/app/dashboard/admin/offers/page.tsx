import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { PageHeader } from '@/components/dashboard/page-header'
import { PersonalOffersAdmin } from '@/components/admin/personal-offers-admin'
import { EngagementAdmin } from '@/components/admin/engagement-admin'
import { ensureEngagementBundleSettings } from '@/lib/engagement-bundles'
import { ensureSeasonalBonusEvents } from '@/lib/seasonal-events'
import { getAutoFunnelSettings } from '@/lib/autofunnels'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Офферы — Админка' }

export default async function AdminOffersPage() {
  await requireAdminPage()
  await Promise.all([
    ensureEngagementBundleSettings(),
    ensureSeasonalBonusEvents(),
  ])
  const offers = await prisma.personalOfferSetting.findMany({
    orderBy: [{ priority: 'asc' }, { scenario: 'asc' }],
    include: {
      promoCode: { select: { id: true, code: true, discountPercent: true, isActive: true } },
    },
  })
  const [promoCodes, trialPlans, welcomeBonusSetting, bundles, seasonalEvents, autoFunnels] = await Promise.all([
    prisma.promoCode.findMany({
      where: { isActive: true },
      orderBy: [{ discountPercent: 'desc' }, { code: 'asc' }],
      select: { id: true, code: true, discountPercent: true },
    }),
    prisma.plan.findMany({
      where: { isActive: true, isPromo: true },
      orderBy: [{ sortOrder: 'asc' }, { durationDays: 'asc' }],
      select: { id: true, name: true, durationDays: true },
    }),
    prisma.welcomeBonusSetting.findUnique({
      where: { id: 'default' },
      include: {
        trialPlan: { select: { id: true, name: true, durationDays: true, isActive: true } },
        promoCode: { select: { id: true, code: true, discountPercent: true, isActive: true } },
      },
    }),
    prisma.engagementBundleSetting.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: { promoCode: { select: { id: true, code: true, discountPercent: true, isActive: true } } },
    }),
    prisma.seasonalBonusEvent.findMany({
      orderBy: [{ createdAt: 'asc' }],
      include: { promoCode: { select: { id: true, code: true, discountPercent: true, isActive: true } } },
    }),
    getAutoFunnelSettings(),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Персональные офферы"
        description="Настройте блок на главной под разные сценарии пользователя"
      />
      <PersonalOffersAdmin
        offers={offers}
        promoCodes={promoCodes}
        trialPlans={trialPlans}
        welcomeBonusSetting={welcomeBonusSetting}
      />
      <EngagementAdmin
        bundles={bundles}
        seasonalEvents={seasonalEvents}
        autoFunnels={autoFunnels}
        promoCodes={promoCodes}
      />
    </div>
  )
}
