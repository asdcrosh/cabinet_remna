import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { PageHeader } from '@/components/dashboard/page-header'
import {
  BonusBoxPrizesAdmin,
  type BonusBoxOpeningAdminRow,
  type BonusBoxPrizeAdminRow,
} from '@/components/admin/bonus-box-prizes-admin'
import { parseAdminListLimit } from '@/lib/admin-list'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Подарочный бокс — Админка' }

export default async function AdminBonusBoxPage({
  searchParams,
}: {
  searchParams?: { limit?: string }
}) {
  await requireAdminPage()
  const limit = parseAdminListLimit(searchParams?.limit)

  const [prizes, totalOpenings, openings] = await Promise.all([
    prisma.bonusBoxPrize.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.bonusBoxOpening.count(),
    prisma.bonusBoxOpening.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { email: true, name: true } },
        prize: true,
        attempt: { select: { source: true } },
        promoCode: { select: { code: true, expiresAt: true } },
      },
    }),
  ])
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
  const openingRows: BonusBoxOpeningAdminRow[] = openings.map((opening) => ({
    id: opening.id,
    createdAt: opening.createdAt.toISOString(),
    userEmail: opening.user.email,
    userName: opening.user.name,
    attemptSource: opening.attempt.source,
    prizeTitle: opening.prize.title,
    prizeType: opening.prize.type,
    prizeValue: opening.prize.value,
    prizeRarity: opening.prize.rarity,
    promoCode: opening.promoCode?.code ?? null,
    promoCodeExpiresAt: opening.promoCode?.expiresAt?.toISOString() ?? null,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Подарочный бокс"
        description="Подарки, веса выпадения, редкость и лимиты"
      />
      <BonusBoxPrizesAdmin prizes={rows} openings={openingRows} totalOpenings={totalOpenings} />
    </div>
  )
}
