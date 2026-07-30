import { prisma } from './prisma'
import { remnashopQuery } from './remnashop-db'
import { syncRemnashopUsersToCabinet } from './remnashop-users'
import { markSyncFailed, markSyncSkipped, markSyncSucceeded } from './sync-events'

type RemnashopSubscriptionStatus = 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'DELETED'
type RemnashopTransactionStatus = 'PENDING' | 'COMPLETED' | 'CANCELED' | 'REFUNDED' | 'FAILED'
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
  availability: 'ALL' | 'NEW' | 'EXISTING' | 'INVITED' | 'ALLOWED' | 'LINK'
  allowed_telegram_ids: Array<string | number | bigint>
  allowed_emails: string[]
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

interface RemnashopWriteAccessRow {
  table_name: string
  can_select: boolean
  can_insert: boolean
  can_update: boolean
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
  gateway_display_name: string | null
  payment_method: string | null
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

export type RemnashopChannelState = 'READY' | 'READ_ONLY' | 'UNAVAILABLE'

export interface RemnashopIntegrationStatus {
  state: 'READY' | 'PARTIAL' | 'READ_ONLY' | 'NOT_CONFIGURED' | 'ERROR'
  database: {
    configured: boolean
    connected: boolean
    writable: boolean
  }
  api: {
    configured: boolean
  }
  events: {
    configured: boolean
    mode: 'REALTIME' | 'POLLING'
  }
  passwordReset: {
    configured: boolean
  }
  channels: {
    users: RemnashopChannelState
    catalog: RemnashopChannelState
    payments: RemnashopChannelState
    promoCodes: RemnashopChannelState
  }
  message: string
}

export async function getRemnashopIntegrationStatus(): Promise<RemnashopIntegrationStatus> {
  const databaseConfigured = Boolean(process.env.REMNASHOP_DATABASE_URL)
  const apiConfigured = Boolean(process.env.REMNASHOP_API_URL?.trim())
  const eventsConfigured = Boolean(process.env.REMNASHOP_WEBHOOK_SECRET?.trim())
  const passwordResetConfigured = Boolean(
    databaseConfigured &&
    process.env.REMNASHOP_CRYPT_KEY?.trim() &&
    process.env.REMNASHOP_REDIS_URL?.trim()
  )
  if (!databaseConfigured) {
    return {
      state: 'NOT_CONFIGURED',
      database: { configured: false, connected: false, writable: false },
      api: { configured: apiConfigured },
      events: { configured: eventsConfigured, mode: eventsConfigured ? 'REALTIME' : 'POLLING' },
      passwordReset: { configured: passwordResetConfigured },
      channels: {
        users: 'UNAVAILABLE',
        catalog: 'UNAVAILABLE',
        payments: 'UNAVAILABLE',
        promoCodes: 'UNAVAILABLE',
      },
      message: 'Не задан REMNASHOP_DATABASE_URL. Обмен данными с Remnashop выключен.',
    }
  }

  try {
    const access = await fetchRemnashopWriteAccess()
    const byTable = new Map(access.map((row) => [row.table_name, row]))
    const readable = (table: string) => Boolean(byTable.get(table)?.can_select)
    const writable = (table: string) =>
      Boolean(byTable.get(table)?.can_insert && byTable.get(table)?.can_update)
    const promoTable = ['promocodes', 'promo_codes', 'coupons', 'discount_codes']
      .find((table) => byTable.has(table))
    const usersState = readable('users')
      ? writable('users') && writable('subscriptions') ? 'READY' : 'READ_ONLY'
      : 'UNAVAILABLE'
    const catalogState = readable('plans') &&
      readable('plan_durations') &&
      readable('plan_prices')
      ? 'READY'
      : 'UNAVAILABLE'
    const paymentsState = readable('transactions')
      ? writable('transactions') && writable('subscriptions') ? 'READY' : 'READ_ONLY'
      : 'UNAVAILABLE'
    const promoCodesState = promoTable && readable(promoTable)
      ? writable(promoTable)
        ? 'READY'
        : 'READ_ONLY'
      : 'UNAVAILABLE'
    const channels = {
      users: usersState,
      catalog: catalogState,
      payments: paymentsState,
      promoCodes: promoCodesState,
    } satisfies RemnashopIntegrationStatus['channels']
    const allReady = Object.values(channels).every((value) => value === 'READY')
    const allReadOnly = Object.values(channels).every((value) => value === 'READ_ONLY')
    const hasUnavailable = Object.values(channels).some((value) => value === 'UNAVAILABLE')
    const coreWritable = writable('users') && writable('subscriptions') && writable('transactions')
    const fullyReady = allReady && apiConfigured && passwordResetConfigured

    return {
      state: fullyReady
        ? 'READY'
        : allReadOnly && !hasUnavailable
          ? 'READ_ONLY'
          : 'PARTIAL',
      database: { configured: true, connected: true, writable: coreWritable },
      api: { configured: apiConfigured },
      events: { configured: eventsConfigured, mode: eventsConfigured ? 'REALTIME' : 'POLLING' },
      passwordReset: { configured: passwordResetConfigured },
      channels,
      message: !apiConfigured
        ? 'База подключена, но REMNASHOP_API_URL не задан. Общий вход по email работать не будет.'
        : !passwordResetConfigured
          ? 'Основной обмен работает, но восстановление пароля пока обновляет только Cabinet.'
        : !eventsConfigured
          ? 'Обмен работает по расписанию. Для мгновенных событий задайте REMNASHOP_WEBHOOK_SECRET.'
        : allReady
          ? 'Подключение активно: Cabinet читает и записывает данные Remnashop.'
          : coreWritable
            ? 'Основной обмен работает. Отдельные каналы ограничены и показаны ниже.'
          : 'База доступна только частично. Проверьте права INSERT и UPDATE.',
    }
  } catch (error) {
    return {
      state: 'ERROR',
      database: { configured: true, connected: false, writable: false },
      api: { configured: apiConfigured },
      events: { configured: eventsConfigured, mode: eventsConfigured ? 'REALTIME' : 'POLLING' },
      passwordReset: { configured: passwordResetConfigured },
      channels: {
        users: 'UNAVAILABLE',
        catalog: 'UNAVAILABLE',
        payments: 'UNAVAILABLE',
        promoCodes: 'UNAVAILABLE',
      },
      message: error instanceof Error ? error.message : 'Не удалось подключиться к Remnashop',
    }
  }
}

export async function getRemnashopSyncDryRun() {
  const integration = await getRemnashopIntegrationStatus()
  if (!integration.database.connected) {
    return {
      mode: 'dryRun' as const,
      source: 'remnashop',
      generatedAt: new Date().toISOString(),
      integration,
      counts: {},
      warnings: [integration.message],
      summary: {},
      samples: {
        plans: [],
        promoCodes: [],
        activeSubscriptions: [],
        transactions: [],
      },
    }
  }

  const [plans, promoCodes, userStats, subscriptions, transactions, writeAccess] = await Promise.all([
    fetchRemnashopPlans(),
    fetchRemnashopPromoCodes(),
    fetchRemnashopUserStats(),
    fetchRemnashopSubscriptions(),
    fetchRemnashopTransactions(),
    fetchRemnashopWriteAccess(),
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
      where: {
        OR: [
          { externalPaymentId: { in: paymentIds } },
          { yookassaId: { in: paymentIds } },
        ],
      },
      select: {
        id: true,
        externalPaymentId: true,
        yookassaId: true,
        providerStatus: true,
        status: true,
      },
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
  const cabinetPaymentsByExternalId = new Map<string, (typeof cabinetPayments)[number]>()
  for (const payment of cabinetPayments) {
    const externalId = payment.externalPaymentId || payment.yookassaId
    if (externalId) cabinetPaymentsByExternalId.set(externalId, payment)
  }
  const cabinetPlanKeys = new Set(
    cabinetPlans.map((plan) => makePlanKey(plan.name, plan.durationDays, plan.priceKopecks))
  )

  const activeSubscriptions = subscriptions.filter((item) => item.status === 'ACTIVE')
  const activeRemnaUuids = new Set(activeSubscriptions.map((item) => item.user_remna_id))
  const unmatchedActiveRemnaUuids = Array.from(activeRemnaUuids).filter(
    (uuid) => !cabinetUsersByRemnaUuid.has(uuid)
  )
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
    const originatedInCabinet = transaction.gateway_display_name?.toLowerCase().includes('cabinet') ?? false
    const cabinetPayment = cabinetPaymentsByExternalId.get(transaction.payment_id)
    const existsInCabinet = originatedInCabinet || Boolean(cabinetPayment)
    const mappedStatus = mapTransactionStatus(transaction.status)
    const needsUpdate = Boolean(
      cabinetPayment &&
      (
        cabinetPayment.status !== mappedStatus ||
        cabinetPayment.providerStatus !== transaction.status
      )
    )
    return {
      sourceId: transaction.id,
      paymentId: transaction.payment_id,
      status: transaction.status,
      mappedStatus,
      userRemnaId: transaction.user_remna_id,
      hasCabinetUser: Boolean(cabinetUser),
      existsInCabinet,
      action: needsUpdate
        ? 'wouldUpdate'
        : existsInCabinet
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
    integration,
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
      cabinetMatchedPayments: cabinetPaymentsByExternalId.size,
    },
    warnings: buildWarnings(userStats, unmatchedActiveRemnaUuids.length, writeAccess),
    summary: {
      plansWouldCreate: planActions.filter((item) => item.action === 'wouldCreate').length,
      promoCodesWouldUpsert: promoActions.length,
      usersWouldNeedIdentityDecision: unmatchedActiveRemnaUuids.length,
      subscriptionsWouldCreateOrUpdate: linkableActiveSubscriptions.filter(
        (item) => !cabinetSubscriptionRemnaUuids.has(item.user_remna_id)
      ).length,
      paymentsWouldCreate: transactionActions.filter((item) => item.action === 'wouldCreate').length,
      paymentsWouldUpdate: transactionActions.filter((item) => item.action === 'wouldUpdate').length,
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

export async function syncRemnashopCatalog(options: {
  includePromoCodes?: boolean
} = {}) {
  const [plans, promoSource, writeAccess] = await Promise.all([
    fetchRemnashopPlans(),
    fetchRemnashopPromoCodesWithMeta(),
    fetchRemnashopWriteAccess(),
  ])
  const promoCodes = options.includePromoCodes === false ? [] : promoSource.rows
  const promoWriteAccess = promoSource.table
    ? writeAccess.find((row) => row.table_name === promoSource.table)
    : undefined
  const promoTableWritable = Boolean(
    promoWriteAccess?.can_insert && promoWriteAccess?.can_update
  )

  const warnings: string[] = []
  let plansDeactivated = 0
  let promoCodesDeactivated = 0
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
      const sourcePlan = await tx.plan.findFirst({
        where: {
          remnashopPlanId: plan.id,
          durationDays: normalized.durationDays,
        },
        orderBy: [{ createdAt: 'asc' }],
      })
      const existing = sourcePlan ?? await tx.plan.findFirst({
        where: {
          name: normalized.name,
          durationDays: normalized.durationDays,
        },
        orderBy: [{ createdAt: 'asc' }],
      })
      const catalogData = {
        name: normalized.name,
        description: normalized.description,
        priceKopecks: normalized.priceKopecks,
        durationDays: normalized.durationDays,
        remnashopPlanId: plan.id,
        trafficLimitGb: normalized.trafficLimitGb,
        deviceLimit: normalized.deviceLimit,
        activeInternalSquads: normalized.activeInternalSquads,
        isPromo: normalized.isPromo,
        isActive: normalized.isActive,
        sortOrder: normalized.sortOrder,
      }
      const accessData = {
        availability: normalized.availability,
        allowedEmails: normalized.allowedEmails,
        allowedTelegramIds: normalized.allowedTelegramIds,
      }

      const cabinetPlan = existing
        ? await tx.plan.update({ where: { id: existing.id }, data: catalogData })
        : await tx.plan.create({ data: { ...catalogData, ...accessData } })

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

      const existingBySource = await tx.promoCode.findUnique({
        where: { remnashopPromoCodeId: promoCode.id },
      })
      const existing = existingBySource ?? await tx.promoCode.findUnique({ where: { code } })
      const data = {
        code,
        remnashopPromoCodeId: promoCode.id,
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

    const sourcePlanKeys = new Set(
      plans.map((plan) => makeSourcePlanKey(plan.id, plan.duration_days))
    )
    const importedPlans = await tx.plan.findMany({
      where: { remnashopPlanId: { not: null }, isActive: true },
      select: { id: true, remnashopPlanId: true, durationDays: true },
    })
    const stalePlanIds = importedPlans
      .filter((plan) =>
        plan.remnashopPlanId !== null &&
        !sourcePlanKeys.has(makeSourcePlanKey(plan.remnashopPlanId, plan.durationDays))
      )
      .map((plan) => plan.id)
    if (stalePlanIds.length > 0) {
      plansDeactivated = (await tx.plan.updateMany({
        where: { id: { in: stalePlanIds } },
        data: { isActive: false },
      })).count
    }

    if (options.includePromoCodes !== false && promoSource.recognized) {
      const sourcePromoCodeIds = promoCodes.map((promoCode) => promoCode.id)
      promoCodesDeactivated = (await tx.promoCode.updateMany({
        where: {
          remnashopPromoCodeId: {
            not: null,
            ...(sourcePromoCodeIds.length > 0 ? { notIn: sourcePromoCodeIds } : {}),
          },
          isActive: true,
        },
        data: { isActive: false },
      })).count
    }
  })

  if (options.includePromoCodes !== false && !promoSource.recognized) {
    warnings.push('Схема промокодов Remnashop не распознана. Деактивация пропущена.')
    await markSyncSkipped({
      direction: 'CABINET_TO_REMNASHOP',
      entityType: 'promoCodeConfig',
      entityId: 'remnashop',
      operation: 'check',
    }, 'remnashop promo code schema is not recognized')
  } else if (options.includePromoCodes !== false && !promoTableWritable) {
    warnings.push('Промокоды прочитаны, но у Cabinet нет прав на их запись в Remnashop.')
    await markSyncSkipped({
      direction: 'CABINET_TO_REMNASHOP',
      entityType: 'promoCodeConfig',
      entityId: 'remnashop',
      operation: 'check',
    }, 'remnashop promo code table is not writable')
  } else if (options.includePromoCodes !== false) {
    await markSyncSucceeded({
      direction: 'CABINET_TO_REMNASHOP',
      entityType: 'promoCodeConfig',
      entityId: 'remnashop',
      operation: 'check',
    })
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
      plansDeactivated,
      promoCodesCreated: promoResults.filter((item) => item.action === 'created').length,
      promoCodesUpdated: promoResults.filter((item) => item.action === 'updated').length,
      promoCodesSkipped: promoResults.filter((item) => item.action === 'skipped').length,
      promoCodesDeactivated,
    },
    warnings,
    samples: {
      plans: planResults.slice(0, 10),
      promoCodes: promoResults.slice(0, 10),
    },
  }
}

export async function syncRemnashopPaymentsToCabinet(options: {
  paymentId?: string
} = {}) {
  const transactions = await fetchRemnashopTransactions(options.paymentId)
  let created = 0
  let updated = 0
  let skipped = 0
  let blocked = 0
  let failed = 0

  for (const transaction of transactions) {
    const event = {
      direction: 'REMNASHOP_TO_CABINET' as const,
      entityType: 'payment',
      entityId: transaction.payment_id,
      operation: 'upsert',
    }
    try {
      const action = await syncRemnashopTransactionToCabinet(transaction)
      if (action === 'created') created += 1
      if (action === 'updated') updated += 1
      if (action === 'skipped') skipped += 1
      if (action === 'blocked') {
        blocked += 1
        await markSyncSkipped(event, 'Cabinet user or plan is not linked')
      } else {
        await markSyncSucceeded(event)
      }
    } catch (error) {
      failed += 1
      await markSyncFailed(event, error)
    }
  }

  return { total: transactions.length, created, updated, skipped, blocked, failed }
}

async function syncRemnashopTransactionToCabinet(
  transaction: RemnashopTransactionRow
): Promise<'created' | 'updated' | 'skipped' | 'blocked'> {
  const provider = mapRemnashopGateway(transaction.gateway_type)
  const status = mapTransactionStatus(transaction.status)
  const existing = await prisma.payment.findFirst({
    where: {
      OR: [
        { provider, externalPaymentId: transaction.payment_id },
        { yookassaId: transaction.payment_id },
      ],
    },
    select: {
      id: true,
      status: true,
      providerStatus: true,
      paidAt: true,
    },
  })

  if (existing) {
    const statusChanged = existing.status !== status || existing.providerStatus !== transaction.status
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: existing.id },
        data: {
          status,
          providerStatus: transaction.status,
          remnashopSyncedAt: new Date(),
          ...(status === 'SUCCEEDED' || status === 'REFUNDED'
            ? { paidAt: existing.paidAt ?? transaction.created_at }
            : {}),
        },
      })
      if (status === 'SUCCEEDED') {
        await tx.promoCodeRedemption.updateMany({
          where: { paymentId: existing.id },
          data: { status: 'SUCCEEDED' },
        })
      } else if (status === 'CANCELED' || status === 'REFUNDED') {
        await tx.promoCodeRedemption.updateMany({
          where: { paymentId: existing.id },
          data: { status: 'CANCELED' },
        })
      }
    })
    return statusChanged ? 'updated' : 'skipped'
  }

  const originatedInCabinet =
    transaction.gateway_display_name?.toLowerCase().includes('cabinet') ?? false
  if (originatedInCabinet) return 'skipped'

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { remnashopUserId: transaction.user_id },
        ...(transaction.user_remna_id
          ? [{ remnawaveUuid: transaction.user_remna_id }]
          : []),
      ],
    },
    select: {
      id: true,
      subscriptions: {
        orderBy: { expireAt: 'desc' },
        take: 1,
        select: { id: true, planId: true },
      },
    },
  })
  if (!user) return 'blocked'

  const snapshot = parseJsonRecord(transaction.plan_snapshot)
  const durationDays = readPositiveInt(snapshot, ['duration', 'duration_days', 'durationDays'])
  const sourcePlanId = readPositiveInt(snapshot, ['id', 'plan_id', 'planId'])
  const snapshotName = readText(snapshot, ['name'])
  const plan = sourcePlanId
    ? await prisma.plan.findFirst({
        where: {
          remnashopPlanId: sourcePlanId,
          ...(durationDays ? { durationDays } : {}),
        },
        select: { id: true },
      })
    : snapshotName
      ? await prisma.plan.findFirst({
          where: {
            name: snapshotName,
            ...(durationDays ? { durationDays } : {}),
          },
          select: { id: true },
        })
      : null
  const planId = plan?.id ?? user.subscriptions[0]?.planId
  if (!planId) return 'blocked'

  const pricing = parseJsonRecord(transaction.pricing)
  const originalAmountKopecks = readMoneyKopecks(
    pricing,
    'original_amount',
    'original_amount_kopecks'
  )
  const amountKopecks = readMoneyKopecks(pricing, 'final_amount', 'amount_kopecks')
  const discountPercent = readPositiveInt(pricing, ['discount_percent']) ?? 0
  const subscriptionId = user.subscriptions[0]?.id ?? null

  await prisma.payment.create({
    data: {
      userId: user.id,
      subscriptionId,
      planId,
      amountKopecks,
      originalAmountKopecks,
      discountPercent,
      discountKopecks: Math.max(0, originalAmountKopecks - amountKopecks),
      provider,
      externalPaymentId: transaction.payment_id,
      providerStatus: transaction.status,
      status,
      paidAt: status === 'SUCCEEDED' || status === 'REFUNDED'
        ? transaction.created_at
        : null,
      subscriptionProvisionedAt: status === 'SUCCEEDED' && subscriptionId
        ? transaction.updated_at
        : null,
      remnashopSyncedAt: new Date(),
    },
  })
  return 'created'
}

export async function maybeSyncRemnashopCatalog() {
  if (!process.env.REMNASHOP_DATABASE_URL) {
    return { skipped: true, reason: 'not_configured' as const }
  }

  const intervalSeconds = Number(process.env.REMNASHOP_CATALOG_SYNC_INTERVAL_SECONDS ?? 300)
  const intervalMs = Math.max(60, Number.isFinite(intervalSeconds) ? intervalSeconds : 300) * 1000
  const key = 'remnashop:catalog-sync'
  const now = new Date()
  const current = await prisma.rateLimitBucket.findUnique({
    where: { key },
    select: { resetAt: true },
  })

  if (current && current.resetAt > now) {
    return { skipped: true, reason: 'throttled' as const, nextSyncAt: current.resetAt }
  }

  const nextSyncAt = new Date(now.getTime() + intervalMs)
  await prisma.rateLimitBucket.upsert({
    where: { key },
    create: { key, count: 1, resetAt: nextSyncAt },
    update: { count: { increment: 1 }, resetAt: nextSyncAt },
  })

  const catalog = await syncRemnashopCatalog()
  const users = await syncRemnashopUsersToCabinet()
  const payments = await syncRemnashopPaymentsToCabinet()
  return { skipped: false, nextSyncAt, report: { catalog, users, payments } }
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
      p.availability::text AS availability,
      COALESCE(
        ARRAY(SELECT allowed_id::text FROM unnest(p.allowed_telegram_ids) AS allowed_id),
        ARRAY[]::text[]
      ) AS allowed_telegram_ids,
      COALESCE(p.allowed_emails, ARRAY[]::text[]) AS allowed_emails,
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
  return (await fetchRemnashopPromoCodesWithMeta()).rows
}

async function fetchRemnashopPromoCodesWithMeta() {
  const table = await firstExistingTable(['promo_codes', 'promocodes', 'coupons', 'discount_codes'])
  if (!table) return { rows: [] as RemnashopPromoCodeRow[], recognized: false, table: null }

  const columns = await tableColumns(table)
  const codeColumn = firstExistingColumn(columns, ['code', 'name'])
  const currentSchema = columns.has('reward_type') && columns.has('reward')
  const discountColumn = firstExistingColumn(columns, ['discount_percent', 'discount', 'percent'])
  if (!codeColumn || (!currentSchema && !discountColumn)) {
    return { rows: [] as RemnashopPromoCodeRow[], recognized: false, table }
  }

  const idColumn = firstExistingColumn(columns, ['id'])
  if (!idColumn) return { rows: [] as RemnashopPromoCodeRow[], recognized: false, table }

  const isActiveColumn = firstExistingColumn(columns, ['is_active', 'active'])
  const startsAtColumn = firstExistingColumn(columns, ['starts_at', 'start_at', 'active_from'])
  const expiresAtColumn = firstExistingColumn(columns, ['expires_at', 'expire_at', 'active_until'])
  const maxUsesColumn = firstExistingColumn(columns, [
    'max_activations',
    'max_uses',
    'usage_limit',
    'uses_limit',
  ])
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
      ${currentSchema
        ? 'COALESCE(pc."reward"::int, 0)'
        : `pc.${quoteIdent(discountColumn as string)}::int`} AS discount_percent,
      ${isActiveColumn ? `COALESCE(pc.${quoteIdent(isActiveColumn)}, true)` : 'true'} AS is_active,
      ${startsAtColumn ? `pc.${quoteIdent(startsAtColumn)}` : 'NULL::timestamp'} AS starts_at,
      ${expiresAtColumn ? `pc.${quoteIdent(expiresAtColumn)}` : 'NULL::timestamp'} AS expires_at,
      ${maxUsesColumn ? `pc.${quoteIdent(maxUsesColumn)}::int` : 'NULL::int'} AS max_uses,
      ${maxUsesPerUserColumn ? `COALESCE(pc.${quoteIdent(maxUsesPerUserColumn)}::int, 1)` : '1'} AS max_uses_per_user,
      ${planIdsSelect} AS plan_ids
    FROM ${quoteIdent(table)} pc
    ${currentSchema
      ? `WHERE pc."reward_type"::text = 'PURCHASE_DISCOUNT'
          AND pc."reward" IS NOT NULL
          AND pc."reward"::int BETWEEN 1 AND 99`
      : ''}
    ORDER BY pc.${quoteIdent(idColumn)}
  `)
  return { rows: result.rows, recognized: true, table }
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

async function fetchRemnashopTransactions(paymentId?: string) {
  const result = await remnashopQuery<RemnashopTransactionRow>(`
    SELECT
      t.id,
      t.payment_id::text AS payment_id,
      t.status,
      t.gateway_type,
      t.gateway_display_name,
      t.payment_method,
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
    ${paymentId ? 'WHERE t.payment_id::text = $1' : ''}
    ORDER BY t.created_at DESC
  `, paymentId ? [paymentId] : [])
  return result.rows
}

async function fetchRemnashopWriteAccess() {
  const result = await remnashopQuery<RemnashopWriteAccessRow>(`
    SELECT
      table_name,
      has_table_privilege(current_user, format('public.%I', table_name), 'SELECT') AS can_select,
      has_table_privilege(current_user, format('public.%I', table_name), 'INSERT') AS can_insert,
      has_table_privilege(current_user, format('public.%I', table_name), 'UPDATE') AS can_update
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    ORDER BY table_name
  `, [[
    'users',
    'plans',
    'plan_durations',
    'plan_prices',
    'subscriptions',
    'transactions',
    'promocode_activations',
    'promo_codes',
    'promocodes',
    'coupons',
    'discount_codes',
  ]])
  return result.rows
}

function buildWarnings(
  userStats: RemnashopUserStatsRow,
  unmatchedActiveSubscriptions: number,
  writeAccess: RemnashopWriteAccessRow[]
) {
  const warnings: string[] = []
  if (numberFromPg(userStats.with_email) === 0) {
    warnings.push('В remnashop нет email у пользователей: для импорта аккаунтов нужен Telegram login или привязка email.')
  }
  if (unmatchedActiveSubscriptions > 0) {
    warnings.push(`Не связаны с Cabinet активные подписки Remnashop: ${unmatchedActiveSubscriptions}. Запустите синхронизацию пользователей.`)
  }
  const missingWriteAccess = writeAccess.filter((row) => !row.can_insert || !row.can_update)
  const promoTables = new Set(['promo_codes', 'promocodes', 'coupons', 'discount_codes'])
  const missingPromoAccess = missingWriteAccess.filter((row) => promoTables.has(row.table_name))
  const missingCoreAccess = missingWriteAccess.filter((row) => !promoTables.has(row.table_name))
  if (missingCoreAccess.length > 0) {
    warnings.push(`Запись основных данных в Remnashop недоступна: нет INSERT/UPDATE для ${missingCoreAccess.map((row) => row.table_name).join(', ')}.`)
  }
  if (missingPromoAccess.length > 0) {
    warnings.push(`Промокоды импортируются, но запись из Cabinet в Remnashop недоступна: нет INSERT/UPDATE для ${missingPromoAccess.map((row) => row.table_name).join(', ')}.`)
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
    availability: plan.availability,
    allowedEmails: plan.allowed_emails.map((email) => email.trim().toLowerCase()).filter(Boolean),
    allowedTelegramIds: plan.allowed_telegram_ids.map(String).filter(Boolean),
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
    case 'PENDING':
      return 'PENDING'
    case 'COMPLETED':
      return 'SUCCEEDED'
    case 'REFUNDED':
      return 'REFUNDED'
    case 'CANCELED':
    case 'FAILED':
      return 'CANCELED'
  }
}

function mapRemnashopGateway(gateway: string) {
  if (gateway === 'PLATEGA') return 'PLATEGA' as const
  return 'YOOKASSA' as const
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function readPositiveInt(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    const number = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(number) && number > 0) return Math.trunc(number)
  }
  return null
}

function readText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readMoneyKopecks(
  source: Record<string, unknown>,
  rublesKey: string,
  kopecksKey: string
) {
  const kopecks = Number(source[kopecksKey])
  if (Number.isFinite(kopecks) && kopecks >= 0) return Math.round(kopecks)
  const rubles = Number(source[rublesKey])
  return Number.isFinite(rubles) && rubles >= 0 ? Math.round(rubles * 100) : 0
}
