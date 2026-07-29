import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { PromoCodesAdmin, type PromoCodeAdminRow } from '@/components/admin/promo-codes-admin'
import { LazyListLoader } from '@/components/admin/lazy-list-loader'
import { ADMIN_LIST_PAGE_SIZE, parseAdminListLimit } from '@/lib/admin-list'
import { cleanupExpiredBonusBoxPromoCodes } from '@/lib/promo-code-cleanup'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Промокоды — Админка' }
const PROMO_RELATION_PREVIEW_SIZE = 25

export default async function AdminPromoCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string; q?: string }>
}) {
  const { user } = await requireAdminPage()
  await cleanupExpiredBonusBoxPromoCodes()
  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const limit = parseAdminListLimit(params.limit)
  const where = q
    ? {
        OR: [
          { code: { contains: q, mode: 'insensitive' as const } },
          { redemptions: { some: { user: { email: { contains: q, mode: 'insensitive' as const } } } } },
          { redemptions: { some: { user: { name: { contains: q, mode: 'insensitive' as const } } } } },
          { bonusBoxOpenings: { some: { user: { email: { contains: q, mode: 'insensitive' as const } } } } },
          { bonusBoxOpenings: { some: { user: { name: { contains: q, mode: 'insensitive' as const } } } } },
          { welcomeBonusRedemptions: { some: { user: { email: { contains: q, mode: 'insensitive' as const } } } } },
          { welcomeBonusRedemptions: { some: { user: { name: { contains: q, mode: 'insensitive' as const } } } } },
        ],
      }
    : undefined

  const [total, promoCodes, plans] = await Promise.all([
    prisma.promoCode.count({ where }),
    prisma.promoCode.findMany({
      where,
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
          take: PROMO_RELATION_PREVIEW_SIZE,
        },
        bonusBoxOpenings: {
          select: {
            createdAt: true,
            prize: { select: { title: true } },
            user: { select: { id: true, email: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: PROMO_RELATION_PREVIEW_SIZE,
        },
        welcomeBonusRedemptions: {
          select: {
            createdAt: true,
            user: { select: { id: true, email: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: PROMO_RELATION_PREVIEW_SIZE,
        },
        _count: {
          select: {
            redemptions: true,
            bonusBoxOpenings: true,
            welcomeBonusRedemptions: true,
          },
        },
      },
    }),
    prisma.plan.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ])
  const promoCodeIds = promoCodes.map((promoCode) => promoCode.id)
  const [redemptionCounts, ownBonusOpenings] = promoCodeIds.length > 0
    ? await Promise.all([
        prisma.promoCodeRedemption.groupBy({
          by: ['promoCodeId', 'status'],
          where: {
            promoCodeId: { in: promoCodeIds },
            status: { in: ['PENDING', 'SUCCEEDED'] },
          },
          _count: { _all: true },
        }),
        prisma.bonusBoxOpening.findMany({
          where: {
            promoCodeId: { in: promoCodeIds },
            userId: user.id,
          },
          distinct: ['promoCodeId'],
          select: { promoCodeId: true },
        }),
      ])
    : [[], []]
  const redemptionCountByPromo = new Map(
    redemptionCounts.map((row) => [`${row.promoCodeId}:${row.status}`, row._count._all])
  )
  const ownBonusPromoIds = new Set(
    ownBonusOpenings.flatMap((opening) => opening.promoCodeId ? [opening.promoCodeId] : [])
  )

  const rows: PromoCodeAdminRow[] = promoCodes.map((promoCode) => {
    const usedCount = redemptionCountByPromo.get(`${promoCode.id}:SUCCEEDED`) ?? 0
    const reservedCount = usedCount + (redemptionCountByPromo.get(`${promoCode.id}:PENDING`) ?? 0)
    const assignees = buildPromoCodeAssignees(promoCode)

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
      usedCount,
      reservedCount,
      planIds: promoCode.plans.map((promoPlan) => promoPlan.planId),
      planNames: promoCode.plans.map((promoPlan) => promoPlan.plan.name),
      assignees,
      hasMoreAssignees:
        promoCode._count.redemptions > promoCode.redemptions.length
        || promoCode._count.bonusBoxOpenings > promoCode.bonusBoxOpenings.length
        || promoCode._count.welcomeBonusRedemptions > promoCode.welcomeBonusRedemptions.length,
      origin: getPromoCodeOrigin(promoCode, ownBonusPromoIds.has(promoCode.id)),
    }
  })

  return (
    <AdminPageShell
      title="Промокоды"
      description="Скидки, аудитории и лимиты использования"
    >
      <PromoCodesAdmin
        promoCodes={rows}
        plans={plans.map((plan) => ({ id: plan.id, name: plan.name }))}
        initialQuery={q}
      />
      <LazyListLoader loaded={promoCodes.length} total={total} step={ADMIN_LIST_PAGE_SIZE} />
    </AdminPageShell>
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
  _count: {
    redemptions: number
    bonusBoxOpenings: number
    welcomeBonusRedemptions: number
  }
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
  hasOwnBonusOpening: boolean
): PromoCodeAdminRow['origin'] {
  if (promoCode._count.bonusBoxOpenings === 0) return 'CREATED'
  return hasOwnBonusOpening ? 'MY_BOX' : 'OTHER_BOX'
}
