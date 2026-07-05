import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { remnashopQuery } from './remnashop-db'
import { logInfo, logWarn } from './logger'
import { markSyncFailed, markSyncSkipped, markSyncSucceeded } from './sync-events'

type RemnashopColumns = Set<string>
type PromoSyncCapability =
  | {
      ok: true
      table: string
      idColumn: string
      codeColumn: string
      discountColumn: string
      columns: RemnashopColumns
    }
  | {
      ok: false
      skipped: string
      table?: string
      columns?: RemnashopColumns
    }

type PromoCodeForRemnashopSync = Prisma.PromoCodeGetPayload<{
  include: {
    plans: {
      include: {
        plan: true
      }
    }
  }
}>

interface IdRow {
  id: string
}

const PROMO_TABLES = ['promo_codes', 'promocodes', 'coupons', 'discount_codes']
const PLAN_LINK_TABLES = [
  'promo_code_plans',
  'promo_codes_plans',
  'promo_code_plan',
  'coupon_plans',
  'discount_code_plans',
]
const PROMO_SYNC_UNAVAILABLE_REASONS = new Set([
  'remnashop promo code table not found',
  'remnashop promo code schema is not recognized',
  'remnashop promo code table is not writable',
])

export async function syncCabinetPromoCodeToRemnashop(promoCodeId: string) {
  if (!process.env.REMNASHOP_DATABASE_URL) {
    return { ok: false as const, skipped: 'REMNASHOP_DATABASE_URL is not configured' }
  }

  const promoCode = await prisma.promoCode.findUnique({
    where: { id: promoCodeId },
    include: { plans: { include: { plan: true } } },
  })
  if (!promoCode) return { ok: false as const, skipped: 'promo code not found' }

  const capability = await diagnosePromoSyncCapability()
  if (!capability.ok) return { ok: false as const, skipped: capability.skipped }

  const { table, columns, idColumn, codeColumn, discountColumn } = capability

  const existingId = await findPromoCodeId(table, idColumn, codeColumn, promoCode.code)
  const values = pickExistingColumns(columns, buildPromoCodeValues(promoCode))
  values[codeColumn] = promoCode.code
  values[discountColumn] = promoCode.discountPercent

  const remnashopPromoCodeId = existingId
    ? await updatePromoCode(table, idColumn, existingId, values)
    : await insertPromoCode(table, idColumn, values)

  await syncPromoCodePlanLinks(remnashopPromoCodeId, promoCode)

  logInfo('remnashop.promo_code_sync.completed', {
    promoCodeId: promoCode.id,
    code: promoCode.code,
    remnashopPromoCodeId,
  })

  return { ok: true as const, remnashopPromoCodeId }
}

export async function syncCabinetPromoCodeToRemnashopBestEffort(promoCodeId: string) {
  const event = {
    direction: 'CABINET_TO_REMNASHOP' as const,
    entityType: 'promoCode',
    entityId: promoCodeId,
    operation: 'upsert',
  }
  try {
    const result = await syncCabinetPromoCodeToRemnashop(promoCodeId)
    if (!result.ok && 'skipped' in result) {
      await markSyncSkipped(
        PROMO_SYNC_UNAVAILABLE_REASONS.has(result.skipped)
          ? {
              direction: 'CABINET_TO_REMNASHOP',
              entityType: 'promoCodeConfig',
              entityId: 'remnashop',
              operation: 'check',
            }
          : event,
        result.skipped
      )
      logWarn('remnashop.promo_code_sync.skipped', { promoCodeId, reason: result.skipped })
    } else if (result.ok) {
      await markSyncSucceeded(event)
    }
    return result
  } catch (error) {
    await markSyncFailed(event, error)
    logWarn('remnashop.promo_code_sync.failed', {
      promoCodeId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return { ok: false as const, error }
  }
}

export async function deactivateCabinetPromoCodesInRemnashopBestEffort(codes: string[]) {
  const uniqueCodes = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)))
  if (uniqueCodes.length === 0 || !process.env.REMNASHOP_DATABASE_URL) return

  try {
    const capability = await diagnosePromoSyncCapability()
    if (!capability.ok) {
      await markSyncSkipped({
        direction: 'CABINET_TO_REMNASHOP',
        entityType: 'promoCodeConfig',
        entityId: 'remnashop',
        operation: 'check',
      }, capability.skipped)
      return
    }
    const { table, columns } = capability
    const codeColumn = firstExistingColumn(columns, ['code', 'name'])
    const isActiveColumn = firstExistingColumn(columns, ['is_active', 'active'])
    if (!codeColumn || !isActiveColumn) return

    await remnashopQuery(
      `
        UPDATE ${quoteIdent(table)}
        SET ${quoteIdent(isActiveColumn)} = false
        WHERE upper(${quoteIdent(codeColumn)}) = ANY($1::text[])
      `,
      [uniqueCodes.map((code) => code.toUpperCase())]
    )
    for (const code of uniqueCodes) {
      await markSyncSucceeded({
        direction: 'CABINET_TO_REMNASHOP',
        entityType: 'promoCode',
        entityId: code,
        operation: 'deactivate',
      })
    }
  } catch (error) {
    for (const code of uniqueCodes) {
      await markSyncFailed({
        direction: 'CABINET_TO_REMNASHOP',
        entityType: 'promoCode',
        entityId: code,
        operation: 'deactivate',
      }, error)
    }
    logWarn('remnashop.promo_code_deactivate.failed', {
      count: uniqueCodes.length,
      message: error instanceof Error ? error.message : 'unknown error',
    })
  }
}

async function diagnosePromoSyncCapability(): Promise<PromoSyncCapability> {
  const table = await firstExistingTable(PROMO_TABLES)
  if (!table) return { ok: false, skipped: 'remnashop promo code table not found' }

  const columns = await tableColumns(table)
  const idColumn = firstExistingColumn(columns, ['id'])
  const codeColumn = firstExistingColumn(columns, ['code', 'name'])
  const discountColumn = firstExistingColumn(columns, ['discount_percent', 'discount', 'percent'])
  if (!idColumn || !codeColumn || !discountColumn) {
    return { ok: false, skipped: 'remnashop promo code schema is not recognized', table, columns }
  }

  const access = await tableWriteAccess(table)
  if (!access.can_insert || !access.can_update) {
    return { ok: false, skipped: 'remnashop promo code table is not writable', table, columns }
  }

  return { ok: true, table, idColumn, codeColumn, discountColumn, columns }
}

async function tableWriteAccess(table: string) {
  const result = await remnashopQuery<{ can_insert: boolean; can_update: boolean }>(
    `
      SELECT
        has_table_privilege(current_user, format('public.%I', $1::text), 'INSERT') AS can_insert,
        has_table_privilege(current_user, format('public.%I', $1::text), 'UPDATE') AS can_update
    `,
    [table]
  )
  return result.rows[0] ?? { can_insert: false, can_update: false }
}

function buildPromoCodeValues(promoCode: PromoCodeForRemnashopSync) {
  const planIds = promoCode.plans
    .map((item) => item.plan.remnashopPlanId)
    .filter((id): id is number => typeof id === 'number')

  return {
    code: promoCode.code,
    name: promoCode.code,
    discount_percent: promoCode.discountPercent,
    discount: promoCode.discountPercent,
    percent: promoCode.discountPercent,
    is_active: promoCode.isActive,
    active: promoCode.isActive,
    starts_at: promoCode.startsAt,
    start_at: promoCode.startsAt,
    active_from: promoCode.startsAt,
    expires_at: promoCode.expiresAt,
    expire_at: promoCode.expiresAt,
    active_until: promoCode.expiresAt,
    max_uses: promoCode.maxUses,
    usage_limit: promoCode.maxUses,
    uses_limit: promoCode.maxUses,
    max_uses_per_user: promoCode.maxUsesPerUser,
    uses_per_user: promoCode.maxUsesPerUser,
    user_limit: promoCode.maxUsesPerUser,
    audience: mapAudience(promoCode.audience),
    allowed_emails: promoCode.allowedEmails,
    plan_ids: planIds,
    source: 'cabinet',
    updated_at: new Date(),
    created_at: promoCode.createdAt,
  }
}

async function syncPromoCodePlanLinks(remnashopPromoCodeId: string, promoCode: PromoCodeForRemnashopSync) {
  const table = await firstExistingTable(PLAN_LINK_TABLES)
  if (!table) return

  const columns = await tableColumns(table)
  const promoFkColumn = firstExistingColumn(columns, [
    'promo_code_id',
    'promocode_id',
    'coupon_id',
    'discount_code_id',
  ])
  const planFkColumn = firstExistingColumn(columns, ['plan_id'])
  if (!promoFkColumn || !planFkColumn) return

  const remnashopPlanIds = promoCode.plans
    .map((item) => item.plan.remnashopPlanId)
    .filter((id): id is number => typeof id === 'number')

  await remnashopQuery(
    `DELETE FROM ${quoteIdent(table)} WHERE ${quoteIdent(promoFkColumn)}::text = $1`,
    [remnashopPromoCodeId]
  )

  for (const planId of remnashopPlanIds) {
    await remnashopQuery(
      `
        INSERT INTO ${quoteIdent(table)} (${quoteIdent(promoFkColumn)}, ${quoteIdent(planFkColumn)})
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
      [remnashopPromoCodeId, planId]
    )
  }
}

async function findPromoCodeId(table: string, idColumn: string, codeColumn: string, code: string) {
  const result = await remnashopQuery<IdRow>(
    `
      SELECT ${quoteIdent(idColumn)}::text AS id
      FROM ${quoteIdent(table)}
      WHERE upper(${quoteIdent(codeColumn)}) = upper($1)
      LIMIT 1
    `,
    [code]
  )
  return result.rows[0]?.id ?? null
}

async function insertPromoCode(table: string, idColumn: string, values: Record<string, unknown>) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined)
  if (entries.length === 0) throw new Error(`No writable columns for ${table}`)

  const result = await remnashopQuery<IdRow>(
    `
      INSERT INTO ${quoteIdent(table)} (${entries.map(([key]) => quoteIdent(key)).join(', ')})
      VALUES (${entries.map((_, index) => `$${index + 1}`).join(', ')})
      RETURNING ${quoteIdent(idColumn)}::text AS id
    `,
    entries.map(([, value]) => toDbValue(value))
  )
  const id = result.rows[0]?.id
  if (!id) throw new Error(`${table} insert did not return id`)
  return id
}

async function updatePromoCode(table: string, idColumn: string, id: string, values: Record<string, unknown>) {
  const entries = Object.entries(values)
    .filter(([key, value]) => key !== 'created_at' && value !== undefined)
  if (entries.length === 0) return id

  await remnashopQuery(
    `
      UPDATE ${quoteIdent(table)}
      SET ${entries.map(([key], index) => `${quoteIdent(key)} = $${index + 1}`).join(', ')}
      WHERE ${quoteIdent(idColumn)}::text = $${entries.length + 1}
    `,
    [...entries.map(([, value]) => toDbValue(value)), id]
  )
  return id
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

function firstExistingColumn(columns: RemnashopColumns, candidates: string[]) {
  return candidates.find((column) => columns.has(column)) ?? null
}

function pickExistingColumns(columns: RemnashopColumns, values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([key]) => columns.has(key)))
}

function mapAudience(audience: string) {
  if (audience === 'NEW_USERS') return 'NEW'
  if (audience === 'NO_ACTIVE_SUBSCRIPTION') return 'NO_ACTIVE_SUBSCRIPTION'
  if (audience === 'PERSONAL') return 'ALLOWED'
  return 'ALL'
}

function toDbValue(value: unknown) {
  if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
    return JSON.stringify(value)
  }
  return value
}

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}
