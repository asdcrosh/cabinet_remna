import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { PageHeader } from '@/components/dashboard/page-header'
import { BonusBoxPrizesAdmin, type BonusBoxPrizeAdminRow } from '@/components/admin/bonus-box-prizes-admin'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Подарочный бокс — Админка' }

export default async function AdminBonusBoxPage() {
  await requireAdminPage()

  const prizes = await prisma.bonusBoxPrize.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  })
  const totalActiveWeight = prizes
    .filter((prize) => prize.isActive && prize.weight > 0 && (prize.maxWins == null || prize.winsCount < prize.maxWins))
    .reduce((sum, prize) => sum + prize.weight, 0)

  const rows: BonusBoxPrizeAdminRow[] = prizes.map((prize) => ({
    id: prize.id,
    title: prize.title,
    description: prize.description,
    type: prize.type,
    value: prize.value,
    weight: prize.weight,
    rarity: prize.rarity,
    isActive: prize.isActive,
    maxWins: prize.maxWins,
    winsCount: prize.winsCount,
    promoExpiresInDays: prize.promoExpiresInDays,
    chance:
      prize.isActive && prize.weight > 0 && totalActiveWeight > 0 && (prize.maxWins == null || prize.winsCount < prize.maxWins)
        ? prize.weight / totalActiveWeight
        : 0,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Подарочный бокс"
        description="Подарки, веса выпадения, редкость и лимиты"
      />
      <BonusBoxPrizesAdmin prizes={rows} />
    </div>
  )
}
