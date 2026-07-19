import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { PersonalOffersAdmin } from '@/components/admin/personal-offers-admin'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Офферы — Админка' }

export default async function AdminOffersPage() {
  await requireAdminPage()
  const offers = await prisma.personalOfferSetting.findMany({
    orderBy: [{ priority: 'asc' }, { scenario: 'asc' }],
    include: {
      promoCode: { select: { id: true, code: true, discountPercent: true, isActive: true } },
    },
  })
  const [promoCodes, trialPlans, welcomeBonusSetting] = await Promise.all([
    prisma.promoCode.findMany({
      where: { isActive: true, bonusBoxOpenings: { none: {} } },
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
        promoCode: {
          select: {
            id: true,
            code: true,
            discountPercent: true,
            isActive: true,
            bonusBoxOpenings: { select: { id: true }, take: 1 },
          },
        },
      },
    }),
  ])
  const welcomeBonusForForm = welcomeBonusSetting?.promoCode?.bonusBoxOpenings.length
    ? {
        ...welcomeBonusSetting,
        promoCode: null,
        promoCodeId: null,
        promoCodeEnabled: false,
      }
    : welcomeBonusSetting

  return (
    <AdminPageShell
      title="Персональные офферы"
      description="Приветственный бонус и предложения по сценариям"
    >
      <PersonalOffersAdmin
        offers={offers}
        promoCodes={promoCodes}
        trialPlans={trialPlans}
        welcomeBonusSetting={welcomeBonusForForm}
      />
    </AdminPageShell>
  )
}
