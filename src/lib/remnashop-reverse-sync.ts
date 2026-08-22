import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { remnawave } from './remnawave'
import { remnashopQuery } from './remnashop-db'
import { logInfo, logWarn } from './logger'
import { markSyncFailed, markSyncSkipped, markSyncSucceeded } from './sync-events'
import { readPlanPurchaseSnapshot, resolveEffectiveDeviceLimit } from './plan-purchase'

type RemnashopColumns = Set<string>

interface RemnashopUserRow {
  id: number
}

interface IdRow {
  id: string
}

interface RemnashopRemnawaveIdentityRow {
  remnawave_uuid: string
}

type PaymentWithRelations = Prisma.PaymentGetPayload<{
  include: {
    user: true
    plan: true
    subscription: true
  }
}>

type PaymentForRemnashopSync = PaymentWithRelations & {
  subscription: NonNullable<PaymentWithRelations['subscription']>
}

export async function syncCabinetPaymentToRemnashop(paymentId: string) {
  if (!process.env.REMNASHOP_DATABASE_URL) {
    await markPaymentRemnashopSyncFailed(paymentId, 'REMNASHOP_DATABASE_URL is not configured')
    return { ok: false as const, skipped: 'REMNASHOP_DATABASE_URL is not configured' }
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      user: true,
      plan: true,
      subscription: true,
    },
  })

  if (!payment) return { ok: false as const, skipped: 'payment not found' }
  if (payment.purchaseType === 'WHITELIST_ADDON') {
    return { ok: false as const, skipped: 'whitelist add-on is not a Remnashop subscription payment' }
  }
  if (payment.status !== 'SUCCEEDED') return { ok: false as const, skipped: 'payment is not succeeded' }
  if (!payment.subscription) {
    await markPaymentRemnashopSyncFailed(payment.id, 'subscription is missing')
    return { ok: false as const, skipped: 'subscription is missing' }
  }
  const latestPayment = await prisma.payment.findFirst({
    where: {
      userId: payment.userId,
      status: 'SUCCEEDED',
      purchaseType: 'SUBSCRIPTION',
      subscriptionProvisionedAt: { not: null },
    },
    orderBy: [
      { paidAt: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    select: { id: true },
  })
  const updatesCurrentSubscription = !latestPayment || latestPayment.id === payment.id
  const remnashopUserId = await resolveRemnashopUserId(payment.user)
  if (!remnashopUserId) {
    await markPaymentRemnashopSyncFailed(payment.id, 'remnashop user not found')
    return { ok: false as const, skipped: 'remnashop user not found' }
  }

  const remnashopRemnawaveUuid = await resolveRemnashopRemnawaveUuid(
    remnashopUserId,
    payment.user.remnawaveUuid
  )
  if (!remnashopRemnawaveUuid) {
    await markPaymentRemnashopSyncFailed(payment.id, 'remnawave user is missing')
    return { ok: false as const, skipped: 'remnawave user is missing' }
  }

  const syncPayment = payment as PaymentForRemnashopSync
  const existingSubscriptionId = updatesCurrentSubscription
    ? null
    : await findRemnashopSubscription(remnashopUserId, remnashopRemnawaveUuid)
  if (!updatesCurrentSubscription && !existingSubscriptionId) {
    await markPaymentRemnashopSyncSucceeded(payment.id)
    return {
      ok: false as const,
      skipped: 'historical payment cannot create or replace the current Remnashop subscription',
    }
  }
  const remnashopSubscriptionId = updatesCurrentSubscription
    ? await upsertRemnashopSubscription({
        remnashopUserId,
        remnashopRemnawaveUuid,
        payment: syncPayment,
      })
    : Number(existingSubscriptionId)
  const remnashopTransactionId = await upsertRemnashopTransaction({
    remnashopUserId,
    remnashopSubscriptionId,
    payment: syncPayment,
  })
  await syncRemnashopPromoActivation(remnashopUserId, syncPayment)
  if (updatesCurrentSubscription) {
    await setCurrentRemnashopSubscription(remnashopUserId, remnashopSubscriptionId)
  }
  await markPaymentRemnashopSyncSucceeded(payment.id)

  logInfo('remnashop.reverse_sync.completed', {
    paymentId,
    remnashopUserId,
    remnashopSubscriptionId,
    remnashopTransactionId,
    subscriptionUpdated: updatesCurrentSubscription,
  })

  return {
    ok: true as const,
    remnashopUserId,
    remnashopSubscriptionId,
    remnashopTransactionId,
    subscriptionUpdated: updatesCurrentSubscription,
  }
}

async function markPaymentRemnashopSyncSucceeded(paymentId: string) {
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      remnashopSyncedAt: new Date(),
      remnashopSyncError: null,
    },
  })
}

async function markPaymentRemnashopSyncFailed(paymentId: string, message: string) {
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      remnashopSyncError: message.slice(0, 1000),
    },
  }).catch(() => null)
}

async function resolveRemnashopUserId(user: {
  id: string
  email: string
  name: string | null
  emailVerifiedAt: Date | null
  telegramId: bigint | null
  telegramUsername: string | null
  remnashopUserId: number | null
}) {
  if (user.remnashopUserId) return user.remnashopUserId

  await linkRemnashopEmailToTelegramIfPossible(user)

  const byTelegram = user.telegramId
    ? await remnashopQuery<RemnashopUserRow>(
        'SELECT id FROM users WHERE telegram_id = $1 LIMIT 1',
        [user.telegramId.toString()]
      )
    : null
  const telegramUserId = byTelegram?.rows[0]?.id ?? null
  if (telegramUserId) {
    await markLocalUserSynced(user.id, telegramUserId)
    return telegramUserId
  }

  if (!user.email.endsWith('@pending.invalid')) {
    const byEmail = await remnashopQuery<RemnashopUserRow>(
      'SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1',
      [user.email]
    )
    const emailUserId = byEmail.rows[0]?.id ?? null
    if (emailUserId) {
      await markLocalUserSynced(user.id, emailUserId)
      return emailUserId
    }
  }

  const createdUserId = await createRemnashopUserForCabinet(user)
  if (createdUserId) {
    await markLocalUserSynced(user.id, createdUserId)
    return createdUserId
  }

  return null
}

async function linkRemnashopEmailToTelegramIfPossible(user: {
  email: string
  emailVerifiedAt: Date | null
  telegramId: bigint | null
}) {
  if (!user.telegramId || !user.emailVerifiedAt || user.email.endsWith('@pending.invalid')) return

  try {
    await remnashopQuery(
      'SELECT * FROM public.cabinet_link_email_to_telegram($1::bigint, $2::text, $3::boolean)',
      [user.telegramId.toString(), user.email, true]
    )
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code !== '42883') throw error
  }
}

async function markLocalUserSynced(userId: string, remnashopUserId: number) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      remnashopUserId,
      remnashopSyncedAt: new Date(),
    },
  })
}

async function createRemnashopUserForCabinet(user: {
  id: string
  email: string
  name: string | null
  emailVerifiedAt: Date | null
  telegramId: bigint | null
  telegramUsername: string | null
}) {
  const hasRealEmail = !user.email.endsWith('@pending.invalid')
  // Email accounts must be created through the Remnashop API so that their
  // password is valid there too. Direct DB creation is only safe for Telegram.
  if (!user.telegramId) return null

  const columns = await tableColumns('users')
  const now = new Date()
  const data = pickExistingColumns(columns, {
    auth_type: 'telegram',
    email: hasRealEmail ? user.email : null,
    is_email_verified: Boolean(hasRealEmail && user.emailVerifiedAt),
    name: user.name || (user.telegramUsername ? `@${user.telegramUsername}` : 'Cabinet user'),
    username: user.telegramUsername,
    telegram_id: user.telegramId?.toString() ?? null,
    referral_code: buildRemnashopReferralCode(user.id),
    role: 'USER',
    language: 'ru',
    personal_discount: 0,
    purchase_discount: 0,
    points: 0,
    is_blocked: false,
    is_bot_blocked: false,
    is_rules_accepted: true,
    is_trial_available: true,
    created_at: now,
    updated_at: now,
  })

  try {
    const id = await insertRow('users', columns, data)
    logInfo('remnashop.reverse_sync.user_created', {
      cabinetUserId: user.id,
      remnashopUserId: id,
      hasTelegram: Boolean(user.telegramId),
      hasEmail: hasRealEmail,
    })
    return Number(id)
  } catch (error) {
    logWarn('remnashop.reverse_sync.user_create_failed', {
      cabinetUserId: user.id,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    throw error
  }
}

async function upsertRemnashopSubscription(input: {
  remnashopUserId: number
  remnashopRemnawaveUuid: string
  payment: PaymentForRemnashopSync
}) {
  const columns = await tableColumns('subscriptions')
  if (columns.has('plan_id') && input.payment.plan.remnashopPlanId == null) {
    throw new Error('remnashop plan is not linked to cabinet plan')
  }
  const subscriptionUrl = columns.has('url')
    ? await resolveRemnawaveSubscriptionUrl(input.payment.user)
    : undefined
  const snapshot = buildPlanSnapshot(input.payment)
  const deviceLimit = effectivePaymentDeviceLimit(input.payment)
  const existingId = columns.has('user_remna_id')
    ? await findRemnashopSubscription(
        input.remnashopUserId,
        input.remnashopRemnawaveUuid
      )
    : null
  const data = pickExistingColumns(columns, {
    user_id: input.remnashopUserId,
    plan_id: input.payment.plan.remnashopPlanId,
    user_remna_id: input.remnashopRemnawaveUuid,
    url: subscriptionUrl,
    status: mapSubscriptionStatus(input.payment.subscription.status),
    is_trial: false,
    disabled_by_channel_leave: false,
    internal_squads: snapshot.internal_squads,
    traffic_limit_strategy: 'NO_RESET',
    tag: null,
    expire_at: input.payment.subscription.expireAt,
    traffic_limit: snapshot.traffic_limit,
    device_limit: deviceLimit,
    plan_snapshot: snapshot,
    created_at: input.payment.subscription.startAt,
    updated_at: new Date(),
  })

  if (existingId) {
    await updateRow('subscriptions', columns, existingId, data)
    return Number(existingId)
  }

  const id = await insertRow('subscriptions', columns, {
    ...data,
    external_squad: null,
  })
  return Number(id)
}

async function resolveRemnawaveSubscriptionUrl(user: {
  remnawaveUsername: string | null
  remnawaveShortUuid: string | null
}) {
  const lookups = [
    user.remnawaveUsername
      ? () => remnawave.getSubscriptionByUsername(user.remnawaveUsername as string)
      : null,
    user.remnawaveShortUuid
      ? () => remnawave.getSubscriptionByShortUuid(user.remnawaveShortUuid as string)
      : null,
  ].filter((lookup): lookup is () => ReturnType<typeof remnawave.getSubscriptionByUsername> => Boolean(lookup))

  let lastError: unknown = null
  for (const lookup of lookups) {
    try {
      const data = await lookup()
      const url = data.response.subscriptionUrl?.trim()
      if (url) return url
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) throw lastError
  throw new Error('remnawave subscription url is missing')
}

async function upsertRemnashopTransaction(input: {
  remnashopUserId: number
  remnashopSubscriptionId: number
  payment: PaymentForRemnashopSync
}) {
  const columns = await tableColumns('transactions')
  const stablePaymentId = stableRemnashopPaymentId(input.payment.id)
  const existingByStableId = columns.has('payment_id')
    ? await remnashopQuery<IdRow>(
        'SELECT id::text AS id FROM transactions WHERE payment_id::text = $1 LIMIT 1',
        [stablePaymentId]
      )
    : null
  let paymentExternalId = stablePaymentId
  let existingId = existingByStableId?.rows[0]?.id ?? null
  if (
    !existingId &&
    columns.has('payment_id') &&
    input.payment.externalPaymentId &&
    input.payment.externalPaymentId !== stablePaymentId
  ) {
    const existingByImportedId = await remnashopQuery<IdRow>(
      'SELECT id::text AS id FROM transactions WHERE payment_id::text = $1 LIMIT 1',
      [input.payment.externalPaymentId]
    )
    if (existingByImportedId.rows[0]?.id) {
      existingId = existingByImportedId.rows[0].id
      paymentExternalId = input.payment.externalPaymentId
    }
  }
  const pricing = buildPricingSnapshot(input.payment)
  const planSnapshot = buildPlanSnapshot(input.payment)
  const gateway = mapPaymentGateway(input.payment.provider)
  const data = pickExistingColumns(columns, {
    user_id: input.remnashopUserId,
    subscription_id: input.remnashopSubscriptionId,
    plan_id: input.payment.plan.remnashopPlanId,
    payment_id: paymentExternalId,
    status: 'COMPLETED',
    is_test: input.payment.provider === 'LOCAL' || input.payment.amountKopecks === 0,
    gateway_type: gateway.type,
    gateway_display_name: gateway.displayName,
    payment_method: input.payment.provider,
    purchase_type: inferPurchaseType(input.payment),
    currency: 'RUB',
    amount: input.payment.amountKopecks,
    amount_kopecks: input.payment.amountKopecks,
    original_amount: input.payment.originalAmountKopecks ?? input.payment.amountKopecks,
    original_amount_kopecks: input.payment.originalAmountKopecks ?? input.payment.amountKopecks,
    discount_amount: input.payment.discountKopecks,
    discount_kopecks: input.payment.discountKopecks,
    pricing,
    plan_snapshot: planSnapshot,
    created_at: input.payment.paidAt ?? input.payment.createdAt,
    updated_at: new Date(),
  })

  if (existingId) {
    await updateRow('transactions', columns, existingId, data)
    return Number(existingId)
  }

  const id = await insertRow('transactions', columns, data)
  return Number(id)
}

async function setCurrentRemnashopSubscription(userId: number, subscriptionId: number) {
  const columns = await tableColumns('users')
  if (!columns.has('current_subscription_id')) return

  await remnashopQuery(
    'UPDATE users SET current_subscription_id = $1 WHERE id = $2',
    [subscriptionId, userId]
  )
}

async function syncRemnashopPromoActivation(
  userId: number,
  payment: PaymentForRemnashopSync
) {
  const code = extractPromoCode(payment.promoCodeSnapshot)
  if (!code) return

  const promoColumns = await tableColumns('promocodes')
  const activationColumns = await tableColumns('promocode_activations')
  if (
    !promoColumns.has('code') ||
    !activationColumns.has('promocode_id') ||
    !activationColumns.has('user_id')
  ) {
    return
  }

  await remnashopQuery(
    `
      INSERT INTO promocode_activations (promocode_id, user_id, activated_at)
      SELECT promo.id, $2, $3
      FROM promocodes promo
      WHERE upper(promo.code) = upper($1)
        AND NOT EXISTS (
          SELECT 1
          FROM promocode_activations activation
          WHERE activation.promocode_id = promo.id
            AND activation.user_id = $2
        )
    `,
    [code, userId, payment.paidAt ?? payment.createdAt]
  )
}

async function findRemnashopSubscription(userId: number, remnawaveUuid: string) {
  const result = await remnashopQuery<IdRow>(
    `
      SELECT s.id::text AS id
      FROM subscriptions s
      WHERE s.user_id = $1
        AND s.user_remna_id::text = $2
      ORDER BY
        (s.id = (SELECT current_subscription_id FROM users WHERE id = $1)) DESC,
        s.updated_at DESC
      LIMIT 1
    `,
    [userId, remnawaveUuid]
  )
  return result.rows[0]?.id ?? null
}

async function resolveRemnashopRemnawaveUuid(
  userId: number,
  localRemnawaveUuid: string | null
) {
  const localUuid = localRemnawaveUuid?.trim()
  if (localUuid) return localUuid

  const result = await remnashopQuery<RemnashopRemnawaveIdentityRow>(
    `
      SELECT s.user_remna_id::text AS remnawave_uuid
      FROM subscriptions s
      WHERE s.user_id = $1
        AND s.user_remna_id IS NOT NULL
      ORDER BY
        (s.id = (SELECT current_subscription_id FROM users WHERE id = $1)) DESC,
        (s.status = 'ACTIVE') DESC,
        s.updated_at DESC
      LIMIT 1
    `,
    [userId]
  )
  return result.rows[0]?.remnawave_uuid?.trim() || null
}

async function tableColumns(table: string): Promise<RemnashopColumns> {
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

function pickExistingColumns(columns: RemnashopColumns, values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => columns.has(key) && value !== undefined)
  )
}

async function insertRow(table: string, columns: RemnashopColumns, values: Record<string, unknown>) {
  const entries = Object.entries(values).filter(([key]) => columns.has(key))
  if (entries.length === 0) throw new Error(`No writable columns for ${table}`)

  const sql = `
    INSERT INTO ${quoteIdent(table)} (${entries.map(([key]) => quoteIdent(key)).join(', ')})
    VALUES (${entries.map((_, index) => `$${index + 1}`).join(', ')})
    RETURNING id::text AS id
  `
  const result = await remnashopQuery<IdRow>(sql, entries.map(([, value]) => toDbValue(value)))
  const id = result.rows[0]?.id
  if (!id) throw new Error(`${table} insert did not return id`)
  return id
}

async function updateRow(
  table: string,
  columns: RemnashopColumns,
  id: string,
  values: Record<string, unknown>
) {
  const entries = Object.entries(values).filter(([key]) => columns.has(key) && key !== 'created_at')
  if (entries.length === 0) return

  const sql = `
    UPDATE ${quoteIdent(table)}
    SET ${entries.map(([key], index) => `${quoteIdent(key)} = $${index + 1}`).join(', ')}
    WHERE id::text = $${entries.length + 1}
  `
  await remnashopQuery(sql, [...entries.map(([, value]) => toDbValue(value)), id])
}

function buildPlanSnapshot(payment: PaymentForRemnashopSync) {
  const purchase = readPlanPurchaseSnapshot(payment.planSnapshot)
  const trafficLimitGb = purchase?.trafficLimitGb ?? payment.plan.trafficLimitGb
  const deviceLimit = effectivePaymentDeviceLimit(payment)
  const durationDays = purchase?.durationDays ?? payment.plan.durationDays
  const activeInternalSquads = purchase?.activeInternalSquads ?? payment.plan.activeInternalSquads
  const hasTrafficLimit = trafficLimitGb != null
  const hasDeviceLimit = deviceLimit > 0
  return {
    id: purchase?.remnashopPlanId ?? payment.plan.remnashopPlanId ?? -1,
    name: purchase?.name ?? payment.plan.name,
    tag: null,
    type: hasTrafficLimit && hasDeviceLimit
      ? 'BOTH'
      : hasTrafficLimit
        ? 'TRAFFIC'
        : hasDeviceLimit
          ? 'DEVICES'
          : 'UNLIMITED',
    traffic_limit_strategy: 'NO_RESET',
    traffic_limit: trafficLimitGb ?? 0,
    device_limit: deviceLimit,
    duration: durationDays,
    internal_squads: activeInternalSquads ?? [],
    external_squad: null,
    is_trial: false,
  }
}

function effectivePaymentDeviceLimit(payment: PaymentForRemnashopSync) {
  return resolveEffectiveDeviceLimit({
    snapshot: payment.planSnapshot,
    paymentDeviceLimit: payment.deviceLimit,
    subscriptionDeviceLimit: payment.subscription.deviceLimit,
    planDeviceLimit: payment.plan.deviceLimit,
  })
}

function buildPricingSnapshot(payment: PaymentForRemnashopSync) {
  const purchase = readPlanPurchaseSnapshot(payment.planSnapshot)
  const originalAmount = payment.originalAmountKopecks ?? payment.amountKopecks
  const derivedDiscountPercent = originalAmount > 0
    ? Math.round((payment.discountKopecks / originalAmount) * 100)
    : 0
  return {
    original_amount: originalAmount / 100,
    base_amount: purchase ? purchase.basePriceKopecks / 100 : payment.plan.priceKopecks / 100,
    selected_device_limit: effectivePaymentDeviceLimit(payment),
    extra_device_count: purchase?.extraDeviceCount ?? 0,
    extra_device_price: purchase ? purchase.extraDevicePriceKopecks / 100 : 0,
    extra_device_amount: purchase ? purchase.extraDeviceAmountKopecks / 100 : 0,
    discount_percent: payment.discountPercent ?? derivedDiscountPercent,
    final_amount: payment.amountKopecks / 100,
  }
}

function extractPromoCode(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const code = (value as { code?: unknown }).code
  return typeof code === 'string' && code.trim() ? code.trim() : null
}

function buildRemnashopReferralCode(userId: string) {
  return `cab_${createHash('sha256').update(userId).digest('hex').slice(0, 32)}`
}

function stableRemnashopPaymentId(paymentId: string) {
  const hex = createHash('sha256').update(`remnashop-payment:${paymentId}`).digest('hex')
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function mapPaymentGateway(provider: string) {
  if (provider === 'PLATEGA') {
    return { type: 'PLATEGA', displayName: 'Platega через Cabinet' }
  }
  if (provider === 'YOOKASSA') {
    return { type: 'YOOKASSA', displayName: 'ЮKassa через Cabinet' }
  }
  return {
    type: 'YOOKASSA',
    displayName: provider === 'PAYANYWAY' ? 'PayAnyWay через Cabinet' : 'Cabinet',
  }
}

function inferPurchaseType(payment: PaymentForRemnashopSync) {
  return payment.subscription.startAt.getTime() < payment.createdAt.getTime() - 60_000
    ? 'RENEW'
    : 'NEW'
}

function mapSubscriptionStatus(status: string) {
  if (status === 'ACTIVE' || status === 'LIMITED') return 'ACTIVE'
  if (status === 'EXPIRED') return 'EXPIRED'
  return 'DISABLED'
}

function toDbValue(value: unknown) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return JSON.stringify(value)
  }
  return value
}

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

export async function syncCabinetPaymentToRemnashopBestEffort(paymentId: string) {
  const { paymentErrorDetails, recordPaymentEvent } = await import('./payment-events')
  const event = {
    direction: 'CABINET_TO_REMNASHOP' as const,
    entityType: 'payment',
    entityId: paymentId,
    operation: 'upsert',
  }
  try {
    const result = await syncCabinetPaymentToRemnashop(paymentId)
    if (!result.ok && 'skipped' in result) {
      await markSyncSkipped(event, result.skipped)
      logWarn('remnashop.reverse_sync.skipped', {
        paymentId,
        reason: result.skipped,
      })
      await recordPaymentEvent({
        paymentId,
        stage: 'REMNASHOP',
        status: 'WARNING',
        source: 'remnashop-reverse-sync',
        message: 'Синхронизация с Remnashop пропущена',
        details: { reason: result.skipped },
        dedupeKey: 'remnashop-skipped',
      })
    } else if (result.ok) {
      await markSyncSucceeded(event)
      await recordPaymentEvent({
        paymentId,
        stage: 'REMNASHOP',
        status: 'SUCCESS',
        source: 'remnashop-reverse-sync',
        message: 'Платёж синхронизирован с Remnashop',
        dedupeKey: 'remnashop-succeeded',
      })
    }
    return result
  } catch (error) {
    await markSyncFailed(event, error)
    await markPaymentRemnashopSyncFailed(
      paymentId,
      error instanceof Error ? error.message : 'unknown remnashop reverse sync error'
    )
    logWarn('remnashop.reverse_sync.failed', {
      paymentId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    await recordPaymentEvent({
      paymentId,
      stage: 'REMNASHOP',
      status: 'ERROR',
      source: 'remnashop-reverse-sync',
      message: 'Не удалось синхронизировать платёж с Remnashop',
      details: paymentErrorDetails(error),
      dedupeKey: 'remnashop-failed',
    })
    return { ok: false as const, error }
  }
}
