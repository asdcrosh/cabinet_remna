import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import {
  BonusBoxPrizesAdmin,
  type BonusBoxOpeningAdminRow,
  type BonusBoxPrizeAdminRow,
} from '@/components/admin/bonus-box-prizes-admin'
import { parseAdminListLimit } from '@/lib/admin-list'
import { getBonusBoxSettings } from '@/lib/bonus-box'
import { notFound } from 'next/navigation'
import { isFeatureEnabled } from '@/lib/feature-flags'
import {
  BonusBoxEngagementAdmin,
  type BonusAnalyticsAdmin,
  type BonusEventAdminRow,
  type BonusMissionAdminRow,
  type BonusRiskAdminRow,
} from '@/components/admin/bonus-box-engagement-admin'
import {
  bonusBoxHistoryWhere,
  getBonusBoxAdminAnalytics,
  type BonusBoxHistoryFilters,
} from '@/lib/bonus-box-admin'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Подарки — Админка' }

export default async function AdminBonusBoxPage({
  searchParams,
}: {
  searchParams: Promise<{
    limit?: string
    q?: string
    prize?: string
    sync?: string
    from?: string
    to?: string
    view?: string
  }>
}) {
  if (!await isFeatureEnabled('bonusBox')) notFound()
  await requireAdminPage()
  const params = await searchParams
  const limit = parseAdminListLimit(params.limit)
  const historyFilters: BonusBoxHistoryFilters = {
    q: params.q?.trim() || undefined,
    prizeId: params.prize || undefined,
    sync: params.sync === 'pending' || params.sync === 'ready' ? params.sync : undefined,
    from: params.from || undefined,
    to: params.to || undefined,
  }
  const historyWhere = bonusBoxHistoryWhere(historyFilters)

  const [
    prizes,
    totalOpenings,
    filteredOpenings,
    pendingSyncCount,
    openings,
    settings,
    missions,
    missionProgressCounts,
    missionCompletedCounts,
    missionClaimedCounts,
    events,
    riskSignals,
    analytics,
  ] = await Promise.all([
    prisma.bonusBoxPrize.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.bonusBoxOpening.count(),
    prisma.bonusBoxOpening.count({ where: historyWhere }),
    prisma.bonusBoxOpening.count({ where: { remoteSynced: false } }),
    prisma.bonusBoxOpening.findMany({
      where: historyWhere,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { email: true, name: true } },
        prize: true,
        attempt: { select: { source: true } },
        promoCode: { select: { code: true, expiresAt: true } },
      },
    }),
    getBonusBoxSettings(),
    prisma.bonusBoxMission.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.bonusBoxMissionProgress.groupBy({
      by: ['missionId'],
      _count: { _all: true },
    }),
    prisma.bonusBoxMissionProgress.groupBy({
      by: ['missionId'],
      where: { completedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.bonusBoxMissionProgress.groupBy({
      by: ['missionId'],
      where: { claimedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.bonusBoxEvent.findMany({
      orderBy: [{ isActive: 'desc' }, { startsAt: 'desc' }],
    }),
    prisma.bonusBoxRiskSignal.findMany({
      where: { reviewedAt: null, score: { gt: 0 } },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: 25,
      include: { user: { select: { email: true, name: true } } },
    }),
    getBonusBoxAdminAnalytics(),
  ])
  const now = new Date()
  const activeEvents = events.filter(
    (event) => event.isActive && event.startsAt <= now && event.endsAt > now
  )
  const activeEventPrizeIds = new Set(activeEvents.flatMap((event) => event.prizeIds))
  const effectiveWeight = (prize: typeof prizes[number]) => {
    if (!prize.isActive || prize.weight <= 0) return 0
    if (prize.maxWins != null && prize.winsCount >= prize.maxWins) return 0
    if (prize.eventOnly && !activeEventPrizeIds.has(prize.id)) return 0
    return activeEvents.reduce(
      (weight, event) => event.prizeIds.includes(prize.id)
        ? weight * Math.max(1, event.weightMultiplier)
        : weight,
      prize.weight
    )
  }
  const totalActiveWeight = prizes.reduce((sum, prize) => sum + effectiveWeight(prize), 0)

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
    estimatedCostKopecks: prize.estimatedCostKopecks,
    eventOnly: prize.eventOnly,
    chance:
      totalActiveWeight > 0 && effectiveWeight(prize) > 0
        ? effectiveWeight(prize) / totalActiveWeight
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
    remoteSynced: opening.remoteSynced,
    syncAttempts: opening.syncAttempts,
    lastSyncError: opening.lastSyncError,
  }))
  const progressByMission = new Map(missionProgressCounts.map((row) => [row.missionId, row._count._all]))
  const completedByMission = new Map(missionCompletedCounts.map((row) => [row.missionId, row._count._all]))
  const claimedByMission = new Map(missionClaimedCounts.map((row) => [row.missionId, row._count._all]))
  const missionRows: BonusMissionAdminRow[] = missions.map((mission) => ({
    id: mission.id,
    title: mission.title,
    description: mission.description,
    type: mission.type,
    target: mission.target,
    rewardAttempts: mission.rewardAttempts,
    isActive: mission.isActive,
    startsAt: mission.startsAt?.toISOString() ?? null,
    endsAt: mission.endsAt?.toISOString() ?? null,
    participants: progressByMission.get(mission.id) ?? 0,
    completed: completedByMission.get(mission.id) ?? 0,
    claimed: claimedByMission.get(mission.id) ?? 0,
  }))
  const eventRows: BonusEventAdminRow[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    isActive: event.isActive,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    attemptsPerUser: event.attemptsPerUser,
    weightMultiplier: event.weightMultiplier,
    prizeIds: event.prizeIds,
    maxClaims: event.maxClaims,
    claimsCount: event.claimsCount,
  }))
  const riskRows: BonusRiskAdminRow[] = riskSignals.map((signal) => ({
    id: signal.id,
    userId: signal.userId,
    userEmail: signal.user.email,
    userName: signal.user.name,
    kind: signal.kind,
    score: signal.score,
    details: signal.details,
    createdAt: signal.createdAt.toISOString(),
  }))

  return (
    <AdminPageShell
      title="Подарки"
      description="Состав, шансы и история открытий"
    >
      <BonusBoxEngagementAdmin
        analytics={analytics as BonusAnalyticsAdmin}
        missions={missionRows}
        events={eventRows}
        riskSignals={riskRows}
        prizes={rows.map((prize) => ({ id: prize.id, title: prize.title }))}
      />
      <BonusBoxPrizesAdmin
        prizes={rows}
        openings={openingRows}
        settings={settings}
        totalOpenings={totalOpenings}
        filteredOpenings={filteredOpenings}
        pendingSyncCount={pendingSyncCount}
        historyFilters={{
          q: historyFilters.q ?? '',
          prizeId: historyFilters.prizeId ?? '',
          sync: historyFilters.sync ?? '',
          from: historyFilters.from ?? '',
          to: historyFilters.to ?? '',
        }}
        initialTab={params.view === 'history' ? 'history' : 'prizes'}
      />
    </AdminPageShell>
  )
}
