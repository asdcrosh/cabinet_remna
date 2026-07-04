import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { PageHeader } from '@/components/dashboard/page-header'
import { PromoCodesAdmin, type PromoCodeAdminRow } from '@/components/admin/promo-codes-admin'
import { LazyListLoader } from '@/components/admin/lazy-list-loader'
import { ADMIN_LIST_PAGE_SIZE, parseAdminListLimit } from '@/lib/admin-list'
import { cleanupExpiredBonusBoxPromoCodes } from '@/lib/promo-code-cleanup'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Промокоды — Админка' }

export default async function AdminPromoCodesPage({
  searchParams,
}: {
  searchParams?: { limit?: string }
}) {
  const { user } = await requireAdminPage()
  await cleanupExpiredBonusBoxPromoCodes()
  const limit = parseAdminListLimit(searchParams?.limit)

  const [total, promoCodes, plans] = await Promise.all([
    prisma.promoCode.count(),
    prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        plans: { include: { plan: true }, orderBy: { plan: { sortOrder: 'asc' } } },
        redemptions: {
          select: {
            status: true,
            createdAt: true,
            user: { select: { id: true, email: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        bonusBoxOpenings: {
          select: {
            createdAt: true,
            prize: { select: { title: true } },
            user: { select: { id: true, email: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        welcomeBonusRedemptions: {
          select: {
            createdAt: true,
            user: { select: { id: true, email: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
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
      audience: promoCode.audience,
      allowedEmails: promoCode.allowedEmails,
      isActive: promoCode.isActive,
      startsAt: promoCode.startsAt?.toISOString() ?? null,
      expiresAt: promoCode.expiresAt?.toISOString() ?? null,
      maxUses: promoCode.maxUses,
      maxUsesPerUser: promoCode.maxUsesPerUser,
      usedCount: promoCode.redemptions.filter((redemption) => redemption.status === 'SUCCEEDED').length,
      reservedCount,
      planIds: promoCode.plans.map((promoPlan) => promoPlan.planId),
      planNames: promoCode.plans.map((promoPlan) => promoPlan.plan.name),
      assignees: buildPromoCodeAssignees(promoCode),
      origin: getPromoCodeOrigin(promoCode, user.id),
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

type PromoCodeForAssignees = Awaited<ReturnType<typeof prisma.promoCode.findMany>>[number] & {
  allowedEmails: string[]
  redemptions: Array<{
    status: string
    createdAt: Date
    user: { id: string; email: string; name: string | null }
  }>
  bonusBoxOpenings: Array<{
    createdAt: Date
    prize: { title: string }
    user: { id: string; email: string; name: string | null }
  }>
  welcomeBonusRedemptions: Array<{
    createdAt: Date
    user: { id: string; email: string; name: string | null }
  }>
}

function buildPromoCodeAssignees(promoCode: PromoCodeForAssignees): PromoCodeAdminRow['assignees'] {
  const assignees: PromoCodeAdminRow['assignees'] = []
  const seen = new Set<string>()

  for (const email of promoCode.allowedEmails) {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || seen.has(`personal:${normalizedEmail}`)) continue
    seen.add(`personal:${normalizedEmail}`)
    assignees.push({
      id: `personal:${normalizedEmail}`,
      userId: null,
      email: normalizedEmail,
      name: null,
      source: 'PERSONAL',
      sourceLabel: 'Персональный доступ',
      createdAt: null,
    })
  }

  for (const opening of promoCode.bonusBoxOpenings) {
    const key = `bonus:${opening.user.id}`
    if (seen.has(key)) continue
    seen.add(key)
    assignees.push({
      id: key,
      userId: opening.user.id,
      email: opening.user.email,
      name: opening.user.name,
      source: 'BONUS_BOX',
      sourceLabel: opening.prize.title ? `Подарок: ${opening.prize.title}` : 'Подарок',
      createdAt: opening.createdAt.toISOString(),
    })
  }

  for (const redemption of promoCode.welcomeBonusRedemptions) {
    const key = `welcome:${redemption.user.id}`
    if (seen.has(key)) continue
    seen.add(key)
    assignees.push({
      id: key,
      userId: redemption.user.id,
      email: redemption.user.email,
      name: redemption.user.name,
      source: 'WELCOME_BONUS',
      sourceLabel: 'Welcome-бонус',
      createdAt: redemption.createdAt.toISOString(),
    })
  }

  for (const redemption of promoCode.redemptions) {
    if (!['PENDING', 'SUCCEEDED'].includes(redemption.status)) continue
    const key = `redemption:${redemption.user.id}:${redemption.status}`
    if (seen.has(key)) continue
    seen.add(key)
    assignees.push({
      id: key,
      userId: redemption.user.id,
      email: redemption.user.email,
      name: redemption.user.name,
      source: 'REDEMPTION',
      sourceLabel: redemption.status === 'SUCCEEDED' ? 'Использовал' : 'Зарезервировал',
      createdAt: redemption.createdAt.toISOString(),
    })
  }

  return assignees
}

function getPromoCodeOrigin(
  promoCode: PromoCodeForAssignees,
  currentUserId: string
): PromoCodeAdminRow['origin'] {
  if (promoCode.bonusBoxOpenings.length === 0) return 'CREATED'
  return promoCode.bonusBoxOpenings.some((opening) => opening.user.id === currentUserId)
    ? 'MY_BOX'
    : 'OTHER_BOX'
}
