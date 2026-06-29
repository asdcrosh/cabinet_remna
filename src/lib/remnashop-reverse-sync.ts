import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { remnashopQuery } from './remnashop-db'
import { logInfo, logWarn } from './logger'

type RemnashopColumns = Set<string>

interface RemnashopUserRow {
  id: number
}

interface IdRow {
  id: string
}

const SOURCE = 'cabinet'

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
  if (payment.status !== 'SUCCEEDED') return { ok: false as const, skipped: 'payment is not succeeded' }
  if (!payment.subscription) return { ok: false as const, skipped: 'subscription is missing' }
  if (!payment.user.remnawaveUuid) return { ok: false as const, skipped: 'remnawave user is missing' }

  const remnashopUserId = await resolveRemnashopUserId(payment.user)
  if (!remnashopUserId) {
    return { ok: false as const, skipped: 'remnashop user not found' }
  }

  const syncPayment = payment as PaymentForRemnashopSync
  const remnashopSubscriptionId = await upsertRemnashopSubscription({
    remnashopUserId,
    payment: syncPayment,
  })
  const remnashopTransactionId = await upsertRemnashopTransaction({
    remnashopUserId,
    payment: syncPayment,
  })
  await setCurrentRemnashopSubscription(remnashopUserId, remnashopSubscriptionId)

  logInfo('remnashop.reverse_sync.completed', {
    paymentId,
    remnashopUserId,
    remnashopSubscriptionId,
    remnashopTransactionId,
  })

  return {
    ok: true as const,
    remnashopUserId,
    remnashopSubscriptionId,
    remnashopTransactionId,
  }
}

async function resolveRemnashopUserId(user: {
  id: string
  email: string
  emailVerifiedAt: Date | null
  telegramId: bigint | null
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

async function upsertRemnashopSubscription(input: {
  remnashopUserId: number
  payment: PaymentForRemnashopSync
}) {
  const columns = await tableColumns('subscriptions')
  const snapshot = buildPlanSnapshot(input.payment)
  const existingId = columns.has('plan_snapshot')
    ? await findRowByCabinetPayment('subscriptions', input.payment.id)
    : null
  const data = pickExistingColumns(columns, {
    user_id: input.remnashopUserId,
    user_remna_id: input.payment.user.remnawaveUuid,
    status: mapSubscriptionStatus(input.payment.subscription.status),
    expire_at: input.payment.subscription.expireAt,
    traffic_limit: input.payment.plan.trafficLimitGb ?? 0,
    device_limit: input.payment.plan.deviceLimit,
    plan_snapshot: snapshot,
    created_at: input.payment.subscription.startAt,
    updated_at: new Date(),
  })

  if (existingId) {
    await updateRow('subscriptions', columns, existingId, data)
    return Number(existingId)
  }

  const id = await insertRow('subscriptions', columns, data)
  return Number(id)
}

async function upsertRemnashopTransaction(input: {
  remnashopUserId: number
  payment: PaymentForRemnashopSync
}) {
  const columns = await tableColumns('transactions')
  const paymentExternalId = input.payment.yookassaId || input.payment.id
  const existingByPaymentId = columns.has('payment_id')
    ? await remnashopQuery<IdRow>(
        'SELECT id::text AS id FROM transactions WHERE payment_id::text = $1 LIMIT 1',
        [paymentExternalId]
      )
    : null
  const existingId = existingByPaymentId?.rows[0]?.id ?? (
    columns.has('pricing') ? await findRowByCabinetPayment('transactions', input.payment.id) : null
  )
  const pricing = buildPricingSnapshot(input.payment)
  const planSnapshot = buildPlanSnapshot(input.payment)
  const data = pickExistingColumns(columns, {
    user_id: input.remnashopUserId,
    payment_id: paymentExternalId,
    status: 'COMPLETED',
    gateway_type: 'YOOKASSA',
    purchase_type: 'SUBSCRIPTION',
    currency: 'RUB',
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

async function findRowByCabinetPayment(table: 'subscriptions' | 'transactions', paymentId: string) {
  const jsonColumn = table === 'subscriptions' ? 'plan_snapshot' : 'pricing'
  const result = await remnashopQuery<IdRow>(
    `
      SELECT id::text AS id
      FROM ${quoteIdent(table)}
      WHERE ${quoteIdent(jsonColumn)}::jsonb ->> 'cabinetPaymentId' = $1
      LIMIT 1
    `,
    [paymentId]
  )
  return result.rows[0]?.id ?? null
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
  return {
    source: SOURCE,
    cabinetPaymentId: payment.id,
    cabinetSubscriptionId: payment.subscription?.id,
    cabinetPlanId: payment.plan.id,
    remnashopPlanId: payment.plan.remnashopPlanId,
    name: payment.plan.name,
    duration_days: payment.plan.durationDays,
    traffic_limit: payment.plan.trafficLimitGb ?? 0,
    device_limit: payment.plan.deviceLimit,
    price_kopecks: payment.amountKopecks,
  }
}

function buildPricingSnapshot(payment: PaymentForRemnashopSync) {
  return {
    source: SOURCE,
    cabinetPaymentId: payment.id,
    amount_kopecks: payment.amountKopecks,
    original_amount_kopecks: payment.originalAmountKopecks ?? payment.amountKopecks,
    discount_kopecks: payment.discountKopecks,
    discount_percent: payment.discountPercent,
    promo_code: extractPromoCode(payment.promoCodeSnapshot),
  }
}

function extractPromoCode(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const code = (value as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function mapSubscriptionStatus(status: string) {
  if (status === 'ACTIVE' || status === 'LIMITED') return 'ACTIVE'
  if (status === 'EXPIRED') return 'EXPIRED'
  return 'DISABLED'
}

function toDbValue(value: unknown) {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return JSON.stringify(value)
  }
  return value
}

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

export async function syncCabinetPaymentToRemnashopBestEffort(paymentId: string) {
  try {
    return await syncCabinetPaymentToRemnashop(paymentId)
  } catch (error) {
    logWarn('remnashop.reverse_sync.failed', {
      paymentId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return { ok: false as const, error }
  }
}
