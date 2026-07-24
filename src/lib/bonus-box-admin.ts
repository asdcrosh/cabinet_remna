import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export type BonusBoxHistoryFilters = {
  q?: string
  prizeId?: string
  sync?: 'pending' | 'ready'
  from?: string
  to?: string
}

export function bonusBoxHistoryWhere(filters: BonusBoxHistoryFilters): Prisma.BonusBoxOpeningWhereInput {
  const from = parseDate(filters.from)
  const to = parseDate(filters.to, true)
  return {
    ...(filters.prizeId ? { prizeId: filters.prizeId } : {}),
    ...(filters.sync === 'pending' ? { remoteSynced: false } : {}),
    ...(filters.sync === 'ready' ? { remoteSynced: true } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(filters.q
      ? {
          user: {
            OR: [
              { email: { contains: filters.q, mode: 'insensitive' } },
              { name: { contains: filters.q, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  }
}

export async function getBonusBoxAdminAnalytics(days = 30) {
  const now = new Date()
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const [openings, payments] = await Promise.all([
    prisma.bonusBoxOpening.findMany({
      where: { createdAt: { gte: from } },
      orderBy: { createdAt: 'asc' },
      select: {
        userId: true,
        createdAt: true,
        expectedChance: true,
        expectedDistribution: true,
        prize: {
          select: {
            id: true,
            title: true,
            type: true,
            estimatedCostKopecks: true,
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: {
        status: 'SUCCEEDED',
        paidAt: { gte: from, lte: now },
      },
      select: {
        userId: true,
        amountKopecks: true,
        paidAt: true,
      },
    }),
  ])

  const firstOpeningByUser = new Map<string, Date>()
  const distribution = new Map<string, {
    prizeId: string
    title: string
    actual: number
    measuredActual: number
    expected: number
    plannedSamples: number
    variance: number
  }>()
  let rewards = 0
  let estimatedCostKopecks = 0

  for (const opening of openings) {
    if (!firstOpeningByUser.has(opening.userId)) {
      firstOpeningByUser.set(opening.userId, opening.createdAt)
    }
    if (opening.prize.type !== 'NO_PRIZE') rewards += 1
    estimatedCostKopecks += opening.prize.estimatedCostKopecks
    const current = distribution.get(opening.prize.id) ?? {
      prizeId: opening.prize.id,
      title: opening.prize.title,
      actual: 0,
      measuredActual: 0,
      expected: 0,
      plannedSamples: 0,
      variance: 0,
    }
    current.actual += 1
    distribution.set(opening.prize.id, current)

    const expectedRows = parseExpectedDistribution(opening.expectedDistribution)
    if (expectedRows.length === 0) continue
    current.measuredActual += 1
    for (const expectedRow of expectedRows) {
      const expectedPrize = distribution.get(expectedRow.prizeId) ?? {
        prizeId: expectedRow.prizeId,
        title: expectedRow.title,
        actual: 0,
        measuredActual: 0,
        expected: 0,
        plannedSamples: 0,
        variance: 0,
      }
      expectedPrize.expected += expectedRow.probability
      expectedPrize.plannedSamples += 1
      expectedPrize.variance += expectedRow.probability * (1 - expectedRow.probability)
      distribution.set(expectedRow.prizeId, expectedPrize)
    }
  }

  const convertedUsers = new Set<string>()
  let attributedRevenueKopecks = 0
  for (const payment of payments) {
    const firstOpening = firstOpeningByUser.get(payment.userId)
    if (!firstOpening || !payment.paidAt || payment.paidAt < firstOpening) continue
    if (payment.paidAt.getTime() - firstOpening.getTime() > ATTRIBUTION_WINDOW_MS) continue
    convertedUsers.add(payment.userId)
    attributedRevenueKopecks += payment.amountKopecks
  }

  const distributionRows = Array.from(distribution.values())
    .map((row) => {
      const probability = row.plannedSamples > 0 ? row.expected / row.plannedSamples : 0
      const zScore = row.variance > 0
        ? (row.measuredActual - row.expected) / Math.sqrt(row.variance)
        : 0
      const deviationPercent = row.expected > 0
        ? ((row.measuredActual - row.expected) / row.expected) * 100
        : null
      return {
        ...row,
        probability,
        deviationPercent,
        zScore,
        flagged: row.plannedSamples >= 30 && row.expected >= 5 && Math.abs(zScore) >= 3,
      }
    })
    .sort((left, right) => right.actual - left.actual)

  const openers = firstOpeningByUser.size
  const marginKopecks = attributedRevenueKopecks - estimatedCostKopecks
  return {
    days,
    openings: openings.length,
    uniqueUsers: openers,
    rewardRate: openings.length > 0 ? rewards / openings.length : 0,
    estimatedCostKopecks,
    convertedUsers: convertedUsers.size,
    conversionRate: openers > 0 ? convertedUsers.size / openers : 0,
    attributedRevenueKopecks,
    marginKopecks,
    roiPercent: estimatedCostKopecks > 0
      ? (marginKopecks / estimatedCostKopecks) * 100
      : null,
    distribution: distributionRows,
    fairnessAlerts: distributionRows.filter((row) => row.flagged).length,
  }
}

function parseExpectedDistribution(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const prizeId = item.prizeId
    const title = item.title
    const probability = item.probability
    if (
      typeof prizeId !== 'string'
      || typeof title !== 'string'
      || typeof probability !== 'number'
      || probability < 0
      || probability > 1
    ) {
      return []
    }
    return [{ prizeId, title, probability }]
  })
}

function parseDate(value: string | undefined, endOfDay = false) {
  if (!value) return null
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`)
  return Number.isNaN(date.getTime()) ? null : date
}
