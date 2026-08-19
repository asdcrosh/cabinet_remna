import { prisma } from './prisma'

const DAY_MS = 24 * 60 * 60 * 1000

export async function getProductAnalytics(periodDays = 30) {
  const days = Math.min(Math.max(Math.trunc(periodDays), 7), 365)
  const now = new Date()
  const start = new Date(now.getTime() - days * DAY_MS)
  const cohortStart = new Date(now.getTime() - 8 * 7 * DAY_MS)

  const [
    registered,
    verified,
    linked,
    paid,
    active,
    paymentStats,
    repeatRows,
    firstPaymentRows,
    autoRenewalRows,
    retentionReasons,
    planRevenue,
    cohorts,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'USER', createdAt: { gte: start } } }),
    prisma.user.count({ where: { role: 'USER', createdAt: { gte: start }, emailVerifiedAt: { not: null } } }),
    prisma.user.count({
      where: {
        role: 'USER',
        createdAt: { gte: start },
        OR: [{ remnawaveUsername: { not: null } }, { telegramLinkedAt: { not: null } }],
      },
    }),
    prisma.user.count({
      where: { role: 'USER', createdAt: { gte: start }, payments: { some: { status: 'SUCCEEDED' } } },
    }),
    prisma.user.count({
      where: {
        role: 'USER',
        createdAt: { gte: start },
        subscriptions: { some: { status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gt: now } } },
      },
    }),
    prisma.payment.aggregate({
      where: {
        status: 'SUCCEEDED',
        OR: [{ paidAt: { gte: start } }, { paidAt: null, createdAt: { gte: start } }],
      },
      _count: true,
      _sum: { amountKopecks: true },
      _avg: { amountKopecks: true },
    }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT p."userId"
        FROM "Payment" p
        WHERE p.status = 'SUCCEEDED'
          AND COALESCE(p."paidAt", p."createdAt") >= ${start}
        GROUP BY p."userId"
        HAVING COUNT(*) >= 2
      ) buyers
    `,
    prisma.$queryRaw<Array<{ paid_24h: bigint; paid_7d: bigint; median_hours: number | null }>>`
      WITH first_payments AS (
        SELECT u.id,
               u."createdAt",
               MIN(COALESCE(p."paidAt", p."createdAt")) AS paid_at
        FROM "User" u
        LEFT JOIN "Payment" p ON p."userId" = u.id AND p.status = 'SUCCEEDED'
        WHERE u.role = 'USER' AND u."createdAt" >= ${start}
        GROUP BY u.id, u."createdAt"
      )
      SELECT
        COUNT(*) FILTER (WHERE paid_at <= "createdAt" + interval '24 hours')::bigint AS paid_24h,
        COUNT(*) FILTER (WHERE paid_at <= "createdAt" + interval '7 days')::bigint AS paid_7d,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (paid_at - "createdAt")) / 3600
        ) FILTER (WHERE paid_at IS NOT NULL)::double precision AS median_hours
      FROM first_payments
    `,
    prisma.autoRenewal.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.subscriptionRetention.groupBy({
      by: ['reason'],
      where: { createdAt: { gte: start }, action: 'AUTO_RENEWAL_DISABLED' },
      _count: { _all: true },
      orderBy: { _count: { reason: 'desc' } },
    }),
    prisma.payment.groupBy({
      by: ['planId'],
      where: {
        status: 'SUCCEEDED',
        OR: [{ paidAt: { gte: start } }, { paidAt: null, createdAt: { gte: start } }],
      },
      _count: { _all: true },
      _sum: { amountKopecks: true },
      orderBy: { _sum: { amountKopecks: 'desc' } },
      take: 6,
    }),
    prisma.$queryRaw<Array<{
      week: Date
      registered: bigint
      paid_7d: bigint
      paid_ever: bigint
      active_now: bigint
    }>>`
      WITH cohort_users AS (
        SELECT
          u.id,
          u."createdAt",
          date_trunc('week', u."createdAt")::date AS week,
          MIN(COALESCE(p."paidAt", p."createdAt")) FILTER (WHERE p.status = 'SUCCEEDED') AS first_paid_at,
          EXISTS (
            SELECT 1 FROM "Subscription" s
            WHERE s."userId" = u.id
              AND s.status IN ('ACTIVE', 'LIMITED')
              AND s."expireAt" > ${now}
          ) AS active_now
        FROM "User" u
        LEFT JOIN "Payment" p ON p."userId" = u.id
        WHERE u.role = 'USER' AND u."createdAt" >= ${cohortStart}
        GROUP BY u.id, u."createdAt"
      )
      SELECT
        week,
        COUNT(*)::bigint AS registered,
        COUNT(*) FILTER (WHERE first_paid_at <= "createdAt" + interval '7 days')::bigint AS paid_7d,
        COUNT(*) FILTER (WHERE first_paid_at IS NOT NULL)::bigint AS paid_ever,
        COUNT(*) FILTER (WHERE active_now)::bigint AS active_now
      FROM cohort_users
      GROUP BY week
      ORDER BY week DESC
    `,
  ])

  const planIds = planRevenue.map((row) => row.planId)
  const plans = planIds.length > 0
    ? await prisma.plan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true } })
    : []
  const planNames = new Map(plans.map((plan) => [plan.id, plan.name]))
  const firstPayment = firstPaymentRows[0]
  const repeatBuyers = Number(repeatRows[0]?.count ?? 0)

  return {
    periodDays: days,
    start,
    generatedAt: now,
    funnel: [
      { key: 'registered', label: 'Зарегистрировались', value: registered },
      { key: 'verified', label: 'Подтвердили email', value: verified },
      { key: 'linked', label: 'Связали профиль', value: linked },
      { key: 'paid', label: 'Оплатили', value: paid },
      { key: 'active', label: 'Активны сейчас', value: active },
    ],
    payments: {
      count: paymentStats._count,
      revenueKopecks: paymentStats._sum.amountKopecks ?? 0,
      averageKopecks: Math.round(paymentStats._avg.amountKopecks ?? 0),
      repeatBuyers,
      paidWithin24h: Number(firstPayment?.paid_24h ?? 0),
      paidWithin7d: Number(firstPayment?.paid_7d ?? 0),
      medianHoursToPayment: firstPayment?.median_hours == null ? null : Math.round(firstPayment.median_hours * 10) / 10,
    },
    autoRenewal: autoRenewalRows.map((row) => ({ status: row.status, count: row._count._all })),
    retentionReasons: retentionReasons.map((row) => ({ reason: row.reason, count: row._count._all })),
    planRevenue: planRevenue.map((row) => ({
      planId: row.planId,
      name: planNames.get(row.planId) ?? 'Удалённый тариф',
      payments: row._count._all,
      revenueKopecks: row._sum?.amountKopecks ?? 0,
    })),
    cohorts: cohorts.map((row) => ({
      week: row.week,
      registered: Number(row.registered),
      paidWithin7d: Number(row.paid_7d),
      paidEver: Number(row.paid_ever),
      activeNow: Number(row.active_now),
    })),
  }
}

export function conversionPercent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0
}
