import { prisma } from './prisma'
import { remnashopQuery } from './remnashop-db'

type RemnashopSubscriptionStatus = 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'DELETED'
type RemnashopTransactionStatus = 'COMPLETED' | 'CANCELED' | 'FAILED'
type CatalogSyncAction = 'created' | 'updated' | 'skipped'

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

interface RemnashopPromoCodeRow {
  id: number
  code: string
  discount_percent: number
  is_active: boolean
  starts_at: Date | null
  expires_at: Date | null
  max_uses: number | null
  max_uses_per_user: number
  plan_ids: number[]
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
  const [plans, promoCodes, userStats, subscriptions, transactions] = await Promise.all([
    fetchRemnashopPlans(),
    fetchRemnashopPromoCodes(),
    fetchRemnashopUserStats(),
    fetchRemnashopSubscriptions(),
    fetchRemnashopTransactions(),
  ])

  const remnaUuids = Array.from(new Set(subscriptions.map((item) => item.user_remna_id)))
  const paymentIds = Array.from(new Set(transactions.map((item) => item.payment_id)))
  const planNames = Array.from(new Set(plans.map((item) => normalizeRemnashopPlan(item).name)))

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
    const normalized = normalizeRemnashopPlan(plan)
    const key = makePlanKey(normalized.name, normalized.durationDays, normalized.priceKopecks)
    return {
      sourceId: plan.id,
      name: normalized.name,
      durationDays: normalized.durationDays,
      priceKopecks: normalized.priceKopecks,
      trafficLimitGb: normalized.trafficLimitGb,
      deviceLimit: normalized.deviceLimit,
      isTrial: normalized.isPromo,
      existsInCabinet: cabinetPlanKeys.has(key),
      action: cabinetPlanKeys.has(key) ? 'keep' : 'wouldCreate',
    }
  })

  const promoActions = promoCodes.map((promoCode) => ({
    sourceId: promoCode.id,
    code: promoCode.code,
    discountPercent: promoCode.discount_percent,
    isActive: promoCode.is_active,
    planIds: promoCode.plan_ids,
    action: 'wouldUpsert' as const,
  }))

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
      remnashopPromoCodes: promoCodes.length,
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
      promoCodesWouldUpsert: promoActions.length,
      usersWouldNeedIdentityDecision: Math.max(0, remnaUuids.length - cabinetUsersByRemnaUuid.size),
      subscriptionsWouldCreateOrUpdate: linkableActiveSubscriptions.filter(
        (item) => !cabinetSubscriptionRemnaUuids.has(item.user_remna_id)
      ).length,
      paymentsWouldCreate: transactionActions.filter((item) => item.action === 'wouldCreate').length,
      paymentsBlockedNoCabinetUser: transactionActions.filter((item) => item.action === 'blockedNoCabinetUser').length,
    },
    samples: {
      plans: planActions.slice(0, 10),
      promoCodes: promoActions.slice(0, 10),
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

export async function syncRemnashopCatalog() {
  const [plans, promoCodes] = await Promise.all([
    fetchRemnashopPlans(),
    fetchRemnashopPromoCodes(),
  ])

  const warnings: string[] = []
  const planResults: Array<{
    sourceId: number
    name: string
    durationDays: number
    action: CatalogSyncAction
    cabinetPlanId: string | null
  }> = []
  const promoResults: Array<{
    sourceId: number
    code: string
    action: CatalogSyncAction
    linkedPlans: number
    skippedPlans: number
  }> = []
  const planIdMap = new Map<string, string>()

  await prisma.$transaction(async (tx) => {
    for (const plan of plans) {
      const normalized = normalizeRemnashopPlan(plan)
      const existing = await tx.plan.findFirst({
        where: {
          name: normalized.name,
          durationDays: normalized.durationDays,
        },
        orderBy: [{ createdAt: 'asc' }],
      })
      const data = {
        name: normalized.name,
        description: normalized.description,
        priceKopecks: normalized.priceKopecks,
        durationDays: normalized.durationDays,
        trafficLimitGb: normalized.trafficLimitGb,
        deviceLimit: normalized.deviceLimit,
        activeInternalSquads: normalized.activeInternalSquads,
        isPromo: normalized.isPromo,
        isActive: normalized.isActive,
        sortOrder: normalized.sortOrder,
      }

      const cabinetPlan = existing
        ? await tx.plan.update({ where: { id: existing.id }, data })
        : await tx.plan.create({ data })

      const key = makeSourcePlanKey(plan.id, plan.duration_days)
      planIdMap.set(key, cabinetPlan.id)
      planResults.push({
        sourceId: plan.id,
        name: cabinetPlan.name,
        durationDays: cabinetPlan.durationDays,
        action: existing ? 'updated' : 'created',
        cabinetPlanId: cabinetPlan.id,
      })
    }

    for (const promoCode of promoCodes) {
      const code = normalizeCode(promoCode.code)
      if (!code) {
        promoResults.push({
          sourceId: promoCode.id,
          code: promoCode.code,
          action: 'skipped',
          linkedPlans: 0,
          skippedPlans: promoCode.plan_ids.length,
        })
        continue
      }

      const existing = await tx.promoCode.findUnique({ where: { code } })
      const data = {
        code,
        discountPercent: clampDiscountPercent(promoCode.discount_percent),
        isActive: promoCode.is_active,
        startsAt: promoCode.starts_at,
        expiresAt: promoCode.expires_at,
        maxUses: promoCode.max_uses,
        maxUsesPerUser: Math.max(1, promoCode.max_uses_per_user || 1),
      }
      const cabinetPromoCode = existing
        ? await tx.promoCode.update({ where: { id: existing.id }, data })
        : await tx.promoCode.create({ data })

      await tx.promoCodePlan.deleteMany({ where: { promoCodeId: cabinetPromoCode.id } })

      const linkedPlanIds = new Set<string>()
      for (const sourcePlanId of promoCode.plan_ids) {
        for (const plan of plans.filter((item) => item.id === sourcePlanId)) {
          const cabinetPlanId = planIdMap.get(makeSourcePlanKey(plan.id, plan.duration_days))
          if (cabinetPlanId) linkedPlanIds.add(cabinetPlanId)
        }
      }

      if (linkedPlanIds.size > 0) {
        await tx.promoCodePlan.createMany({
          data: Array.from(linkedPlanIds).map((planId) => ({
            promoCodeId: cabinetPromoCode.id,
            planId,
          })),
          skipDuplicates: true,
        })
      }

      promoResults.push({
        sourceId: promoCode.id,
        code,
        action: existing ? 'updated' : 'created',
        linkedPlans: linkedPlanIds.size,
        skippedPlans: Math.max(0, promoCode.plan_ids.length - linkedPlanIds.size),
      })
    }
  })

  if (promoCodes.length === 0) {
    warnings.push('Промокоды remnashop не найдены или схема промокодов не распознана.')
  }

  return {
    mode: 'apply' as const,
    source: 'remnashop',
    generatedAt: new Date().toISOString(),
    counts: {
      remnashopPlans: plans.length,
      remnashopPromoCodes: promoCodes.length,
      plansCreated: planResults.filter((item) => item.action === 'created').length,
      plansUpdated: planResults.filter((item) => item.action === 'updated').length,
      promoCodesCreated: promoResults.filter((item) => item.action === 'created').length,
      promoCodesUpdated: promoResults.filter((item) => item.action === 'updated').length,
      promoCodesSkipped: promoResults.filter((item) => item.action === 'skipped').length,
    },
    warnings,
    samples: {
      plans: planResults.slice(0, 10),
      promoCodes: promoResults.slice(0, 10),
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

async function fetchRemnashopPromoCodes() {
  const table = await firstExistingTable(['promo_codes', 'promocodes', 'coupons', 'discount_codes'])
  if (!table) return []

  const columns = await tableColumns(table)
  const codeColumn = firstExistingColumn(columns, ['code', 'name'])
  const discountColumn = firstExistingColumn(columns, ['discount_percent', 'discount', 'percent'])
  if (!codeColumn || !discountColumn) return []

  const idColumn = firstExistingColumn(columns, ['id'])
  if (!idColumn) return []

  const isActiveColumn = firstExistingColumn(columns, ['is_active', 'active'])
  const startsAtColumn = firstExistingColumn(columns, ['starts_at', 'start_at', 'active_from'])
  const expiresAtColumn = firstExistingColumn(columns, ['expires_at', 'expire_at', 'active_until'])
  const maxUsesColumn = firstExistingColumn(columns, ['max_uses', 'usage_limit', 'uses_limit'])
  const maxUsesPerUserColumn = firstExistingColumn(columns, ['max_uses_per_user', 'uses_per_user', 'user_limit'])

  const planLinkTable = await firstExistingTable([
    'promo_code_plans',
    'promo_codes_plans',
    'promo_code_plan',
    'coupon_plans',
    'discount_code_plans',
  ])
  const planLinkColumns = planLinkTable ? await tableColumns(planLinkTable) : new Set<string>()
  const promoFkColumn = firstExistingColumn(planLinkColumns, [
    'promo_code_id',
    'promocode_id',
    'coupon_id',
    'discount_code_id',
  ])
  const planFkColumn = firstExistingColumn(planLinkColumns, ['plan_id'])

  const planIdsSelect =
    planLinkTable && promoFkColumn && planFkColumn
      ? `(SELECT COALESCE(array_agg(link.${quoteIdent(planFkColumn)}::int), ARRAY[]::int[]) FROM ${quoteIdent(planLinkTable)} link WHERE link.${quoteIdent(promoFkColumn)} = pc.${quoteIdent(idColumn)})`
      : 'ARRAY[]::int[]'

  const result = await remnashopQuery<RemnashopPromoCodeRow>(`
    SELECT
      pc.${quoteIdent(idColumn)}::int AS id,
      pc.${quoteIdent(codeColumn)}::text AS code,
      pc.${quoteIdent(discountColumn)}::int AS discount_percent,
      ${isActiveColumn ? `COALESCE(pc.${quoteIdent(isActiveColumn)}, true)` : 'true'} AS is_active,
      ${startsAtColumn ? `pc.${quoteIdent(startsAtColumn)}` : 'NULL::timestamp'} AS starts_at,
      ${expiresAtColumn ? `pc.${quoteIdent(expiresAtColumn)}` : 'NULL::timestamp'} AS expires_at,
      ${maxUsesColumn ? `pc.${quoteIdent(maxUsesColumn)}::int` : 'NULL::int'} AS max_uses,
      ${maxUsesPerUserColumn ? `COALESCE(pc.${quoteIdent(maxUsesPerUserColumn)}::int, 1)` : '1'} AS max_uses_per_user,
      ${planIdsSelect} AS plan_ids
    FROM ${quoteIdent(table)} pc
    ORDER BY pc.${quoteIdent(idColumn)}
  `)
  return result.rows
}

async function firstExistingTable(candidates: string[]) {
  const result = await remnashopQuery<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY array_position($1::text[], table_name)
      LIMIT 1
    `,
    [candidates]
  )
  return result.rows[0]?.table_name ?? null
}

async function tableColumns(table: string) {
  const result = await remnashopQuery<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [table]
  )
  return new Set(result.rows.map((row) => row.column_name))
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

function normalizeRemnashopPlan(plan: RemnashopPlanRow) {
  const durationLabel = plan.duration_days > 0 ? `${plan.duration_days} дн.` : ''
  const baseName = plan.name.trim()
  return {
    name: durationLabel && !baseName.includes(durationLabel) ? `${baseName} ${durationLabel}` : baseName,
    description: plan.is_trial ? 'Ознакомительный тариф' : null,
    priceKopecks: plan.is_trial ? 0 : rubToKopecks(plan.price_rub),
    durationDays: Math.max(1, plan.duration_days),
    trafficLimitGb: plan.traffic_limit === 0 ? null : plan.traffic_limit,
    deviceLimit: Math.max(1, plan.device_limit || 1),
    activeInternalSquads: parseInternalSquads(plan.internal_squads),
    isPromo: plan.is_trial,
    isActive: plan.is_active,
    sortOrder: plan.id * 100 + plan.duration_days,
  }
}

function parseInternalSquads(value: string[] | string) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string' && Boolean(item))
  } catch {
    // fall through to comma/newline parsing
  }
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase()
}

function clampDiscountPercent(value: number) {
  return Math.min(99, Math.max(1, Math.trunc(value)))
}

function numberFromPg(value: string | number | bigint) {
  return Number(value)
}

function makePlanKey(name: string, durationDays: number, priceKopecks: number) {
  return `${name}:${durationDays}:${priceKopecks}`
}

function makeSourcePlanKey(planId: number, durationDays: number) {
  return `${planId}:${durationDays}`
}

function firstExistingColumn(columns: Set<string>, candidates: string[]) {
  return candidates.find((candidate) => columns.has(candidate)) ?? null
}

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`
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
