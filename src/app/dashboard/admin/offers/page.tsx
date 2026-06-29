import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { PageHeader } from '@/components/dashboard/page-header'
import { PersonalOffersAdmin } from '@/components/admin/personal-offers-admin'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Офферы — Админка' }

export default async function AdminOffersPage() {
  await requireAdminPage()
  const offers = await prisma.personalOfferSetting.findMany({
    orderBy: [{ priority: 'asc' }, { scenario: 'asc' }],
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Персональные офферы"
        description="Настройте блок на главной под разные сценарии пользователя"
      />
      <PersonalOffersAdmin offers={offers} />
    </div>
  )
}
