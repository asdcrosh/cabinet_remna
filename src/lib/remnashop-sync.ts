import { prisma } from './prisma'
import { remnashopQuery } from './remnashop-db'

type RemnashopSubscriptionStatus = 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'DELETED'
type RemnashopTransactionStatus = 'COMPLETED' | 'CANCELED' | 'FAILED'

interface RemnashopPlanRow {
  id: number
  name: string
  is_active: boolean
  is_trial: boolean
  traffic_limit: number
  device_limit: number
  duration_days: number
  price_rub: string | null
  internal_squads: string[] | string
}

interface RemnashopUserStatsRow {
  total: string
  with_email: string
  verified_email: string
  telegram_only: string
  with_current_subscription: string
}

interface RemnashopSubscriptionRow {
  id: number
  user_id: number
  user_remna_id: string
  status: RemnashopSubscriptionStatus
  expire_at: Date
  created_at: Date
  traffic_limit: number
  device_limit: number
  plan_snapshot: unknown
  user_email: string | null
  user_name: string
  telegram_id: string | null
}

interface RemnashopTransactionRow {
  id: number
  payment_id: string
  status: RemnashopTransactionStatus
  gateway_type: string
  purchase_type: string
  currency: string
  pricing: unknown
  plan_snapshot: unknown
  created_at: Date
  updated_at: Date
  user_id: number
  user_remna_id: string | null
}

interface CabinetUserRow {
  id: string
  remnawaveUuid: string | null
}

export async function getRemnashopSyncDryRun() {
  const [plans, userStats, subscriptions, transactions] = await Promise.all([
    fetchRemnashopPlans(),
    fetchRemnashopUserStats(),
    fetchRemnashopSubscriptions(),
    fetchRemnashopTransactions(),
  ])

  const remnaUuids = Array.from(new Set(subscriptions.map((item) => item.user_remna_id)))
  const paymentIds = Array.from(new Set(transactions.map((item) => item.payment_id)))
  const planNames = Array.from(new Set(plans.map((item) => item.name)))

  const [cabinetUsers, cabinetSubscriptions, cabinetPayments, cabinetPlans] = await Promise.all([
    prisma.user.findMany({
      where: { remnawaveUuid: { in: remnaUuids } },
      select: { id: true, remnawaveUuid: true },
    }),
    prisma.subscription.findMany({
      where: { user: { remnawaveUuid: { in: remnaUuids } } },
      select: { id: true, user: { select: { remnawaveUuid: true } } },
    }),
    prisma.payment.findMany({
      where: { yookassaId: { in: paymentIds } },
      select: { id: true, yookassaId: true },
    }),
    prisma.plan.findMany({
      where: { name: { in: planNames } },
      select: { id: true, name: true, durationDays: true, priceKopecks: true },
    }),
  ])

  const cabinetUsersByRemnaUuid = new Map(
    cabinetUsers
      .filter((user): user is CabinetUserRow & { remnawaveUuid: string } => Boolean(user.remnawaveUuid))
      .map((user) => [user.remnawaveUuid, user])
  )
  const cabinetSubscriptionRemnaUuids = new Set(
    cabinetSubscriptions
      .map((subscription) => subscription.user.remnawaveUuid)
      .filter((uuid): uuid is string => Boolean(uuid))
  )
  const cabinetPaymentIds = new Set(
    cabinetPayments
      .map((payment) => payment.yookassaId)
      .filter((id): id is string => Boolean(id))
  )
  const cabinetPlanKeys = new Set(
    cabinetPlans.map((plan) => makePlanKey(plan.name, plan.durationDays, plan.priceKopecks))
  )

  const activeSubscriptions = subscriptions.filter((item) => item.status === 'ACTIVE')
  const linkableActiveSubscriptions = activeSubscriptions.filter((item) =>
    cabinetUsersByRemnaUuid.has(item.user_remna_id)
  )

  const planActions = plans.map((plan) => {
    const priceKopecks = rubToKopecks(plan.price_rub)
    const key = makePlanKey(plan.name, plan.duration_days, priceKopecks)
    return {
      sourceId: plan.id,
      name: plan.name,
      durationDays: plan.duration_days,
      priceKopecks,
      trafficLimitGb: plan.traffic_limit === 0 ? null : plan.traffic_limit,
      deviceLimit: plan.device_limit,
      isTrial: plan.is_trial,
      existsInCabinet: cabinetPlanKeys.has(key),
      action: cabinetPlanKeys.has(key) ? 'keep' : 'wouldCreate',
    }
  })

  const transactionActions = transactions.map((transaction) => {
    const cabinetUser = transaction.user_remna_id
      ? cabinetUsersByRemnaUuid.get(transaction.user_remna_id)
      : null
    return {
      sourceId: transaction.id,
      paymentId: transaction.payment_id,
      status: transaction.status,
      mappedStatus: mapTransactionStatus(transaction.status),
      userRemnaId: transaction.user_remna_id,
      hasCabinetUser: Boolean(cabinetUser),
      existsInCabinet: cabinetPaymentIds.has(transaction.payment_id),
      action: cabinetPaymentIds.has(transaction.payment_id)
        ? 'keep'
        : cabinetUser
          ? 'wouldCreate'
          : 'blockedNoCabinetUser',
    }
  })

  return {
    mode: 'dryRun' as const,
    source: 'remnashop',
    generatedAt: new Date().toISOString(),
    counts: {
      remnashopUsers: numberFromPg(userStats.total),
      remnashopUsersWithEmail: numberFromPg(userStats.with_email),
      remnashopVerifiedEmails: numberFromPg(userStats.verified_email),
      remnashopTelegramOnlyUsers: numberFromPg(userStats.telegram_only),
      remnashopUsersWithCurrentSubscription: numberFromPg(userStats.with_current_subscription),
      remnashopPlans: plans.length,
      remnashopSubscriptions: subscriptions.length,
      remnashopActiveSubscriptions: activeSubscriptions.length,
      remnashopTransactions: transactions.length,
      cabinetMatchedUsers: cabinetUsersByRemnaUuid.size,
      cabinetMatchedSubscriptions: cabinetSubscriptionRemnaUuids.size,
      cabinetMatchedPayments: cabinetPaymentIds.size,
    },
    warnings: buildWarnings(userStats, cabinetUsersByRemnaUuid.size, remnaUuids.length),
    summary: {
      plansWouldCreate: planActions.filter((item) => item.action === 'wouldCreate').length,
      usersWouldNeedIdentityDecision: Math.max(0, remnaUuids.length - cabinetUsersByRemnaUuid.size),
      subscriptionsWouldCreateOrUpdate: linkableActiveSubscriptions.filter(
        (item) => !cabinetSubscriptionRemnaUuids.has(item.user_remna_id)
      ).length,
      paymentsWouldCreate: transactionActions.filter((item) => item.action === 'wouldCreate').length,
      paymentsBlockedNoCabinetUser: transactionActions.filter((item) => item.action === 'blockedNoCabinetUser').length,
    },
    samples: {
      plans: planActions.slice(0, 10),
      activeSubscriptions: activeSubscriptions.slice(0, 10).map((item) => ({
        sourceId: item.id,
        userId: item.user_id,
        userRemnaId: item.user_remna_id,
        status: item.status,
        expireAt: item.expire_at.toISOString(),
        deviceLimit: item.device_limit,
        trafficLimitGb: item.traffic_limit === 0 ? null : item.traffic_limit,
        hasCabinetUser: cabinetUsersByRemnaUuid.has(item.user_remna_id),
        hasCabinetSubscription: cabinetSubscriptionRemnaUuids.has(item.user_remna_id),
      })),
      transactions: transactionActions.slice(0, 10),
    },
  }
}

async function fetchRemnashopPlans() {
  const result = await remnashopQuery<RemnashopPlanRow>(`
    SELECT
      p.id,
      p.name,
      p.is_active,
      p.is_trial,
      p.traffic_limit,
      p.device_limit,
      p.internal_squads,
      d.days AS duration_days,
      MAX(CASE WHEN pp.currency = 'RUB' THEN pp.price::text END) AS price_rub
    FROM plans p
    JOIN plan_durations d ON d.plan_id = p.id
    LEFT JOIN plan_prices pp ON pp.plan_duration_id = d.id
    GROUP BY p.id, d.id
    ORDER BY p.order_index, d.days
  `)
  return result.rows
}

async function fetchRemnashopUserStats() {
  const result = await remnashopQuery<RemnashopUserStatsRow>(`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE email IS NOT NULL)::text AS with_email,
      COUNT(*) FILTER (WHERE is_email_verified)::text AS verified_email,
      COUNT(*) FILTER (WHERE auth_type = 'telegram')::text AS telegram_only,
      COUNT(*) FILTER (WHERE current_subscription_id IS NOT NULL)::text AS with_current_subscription
    FROM users
  `)
  return result.rows[0] ?? {
    total: '0',
    with_email: '0',
    verified_email: '0',
    telegram_only: '0',
    with_current_subscription: '0',
  }
}

async function fetchRemnashopSubscriptions() {
  const result = await remnashopQuery<RemnashopSubscriptionRow>(`
    SELECT
      s.id,
      s.user_id,
      s.user_remna_id::text AS user_remna_id,
      s.status,
      s.expire_at,
      s.created_at,
      s.traffic_limit,
      s.device_limit,
      s.plan_snapshot,
      u.email AS user_email,
      u.name AS user_name,
      u.telegram_id::text AS telegram_id
    FROM subscriptions s
    JOIN users u ON u.id = s.user_id
    ORDER BY s.updated_at DESC
  `)
  return result.rows
}

async function fetchRemnashopTransactions() {
  const result = await remnashopQuery<RemnashopTransactionRow>(`
    SELECT
      t.id,
      t.payment_id::text AS payment_id,
      t.status,
      t.gateway_type,
      t.purchase_type,
      t.currency,
      t.pricing,
      t.plan_snapshot,
      t.created_at,
      t.updated_at,
      t.user_id,
      s.user_remna_id::text AS user_remna_id
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN subscriptions s ON s.id = u.current_subscription_id
    ORDER BY t.created_at DESC
  `)
  return result.rows
}

function buildWarnings(userStats: RemnashopUserStatsRow, matchedCabinetUsers: number, remnashopRemnaUsers: number) {
  const warnings: string[] = []
  if (numberFromPg(userStats.with_email) === 0) {
    warnings.push('В remnashop нет email у пользователей: для импорта аккаунтов нужен Telegram login или привязка email.')
  }
  if (matchedCabinetUsers < remnashopRemnaUsers) {
    warnings.push('Часть remnashop подписок ссылается на Remnawave UUID, которых пока нет среди cabinet пользователей.')
  }
  return warnings
}

function rubToKopecks(value: string | null) {
  if (!value) return 0
  return Math.round(Number(value) * 100)
}

function numberFromPg(value: string | number | bigint) {
  return Number(value)
}

function makePlanKey(name: string, durationDays: number, priceKopecks: number) {
  return `${name}:${durationDays}:${priceKopecks}`
}

function mapTransactionStatus(status: RemnashopTransactionStatus) {
  switch (status) {
    case 'COMPLETED':
      return 'SUCCEEDED'
    case 'CANCELED':
    case 'FAILED':
      return 'CANCELED'
  }
}
