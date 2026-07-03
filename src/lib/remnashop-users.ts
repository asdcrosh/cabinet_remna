import { randomBytes } from 'node:crypto'
import { hash } from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { remnawave } from './remnawave'
import { remnashopQuery } from './remnashop-db'
import { generateUniqueReferralCode } from './referrals'
import { toRemnawaveTelegramId } from './telegram-remnawave'
import { upsertLocalSubscriptionFromRemnawave } from './remnawave-local-sync'
import { logWarn } from './logger'

interface RemnashopIdentityRow {
  id: number
  telegram_id: string | null
  email: string | null
  is_email_verified: boolean
  name: string
  username: string | null
}

interface RemnashopUserRow extends RemnashopIdentityRow {
  user_remna_id: string | null
  subscription_created_at: Date | null
  subscription_plan_snapshot: unknown
  subscription_traffic_limit: number | null
  subscription_device_limit: number | null
}

type LocalUserForRemnashopSync = NonNullable<Awaited<ReturnType<typeof getLocalUserForRemnashopSync>>>

export async function findRemnashopUserByEmail(email: string) {
  const result = await remnashopQuery<RemnashopIdentityRow>(
    `
      SELECT id, telegram_id::text AS telegram_id, email, is_email_verified, name, username
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email]
  )
  return result.rows[0] ?? null
}

export async function syncRemnashopUserToCabinet(localUserId: string, options: {
  forceRemnawaveSubscriptions?: boolean
} = {}) {
  if (!process.env.REMNASHOP_DATABASE_URL) {
    return { found: false as const, reason: 'REMNASHOP_DATABASE_URL is not configured' as const }
  }

  const existing = await getLocalUserForRemnashopSync(localUserId)
  if (!existing) return { found: false as const, reason: 'local_user_not_found' as const }

  const source = await findRemnashopSourceForLocalUser(existing)
  if (!source) return { found: false as const, reason: 'remnashop_user_not_found' as const }

  const result = await syncRemnashopSourceToCabinet(source, {
    ...options,
    existingUserId: existing.id,
  })

  return {
    found: true as const,
    remnashopUserId: source.id,
    ...result,
  }
}

export async function syncRemnashopUsersToCabinet(options: {
  forceRemnawaveSubscriptions?: boolean
} = {}) {
  const result = await fetchRemnashopSources()
  let created = 0
  let updated = 0
  let skipped = 0
  let subscriptionsSynced = 0
  let subscriptionsSkipped = 0
  let subscriptionsFailed = 0

  for (const source of result.rows) {
    try {
      const row = await syncRemnashopSourceToCabinet(source, options)
      if (row.userAction === 'created') created += 1
      if (row.userAction === 'updated') updated += 1
      if (row.userAction === 'skipped') skipped += 1
      if (row.subscriptionAction === 'synced') subscriptionsSynced += 1
      if (row.subscriptionAction === 'skipped') subscriptionsSkipped += 1
      if (row.subscriptionAction === 'failed') subscriptionsFailed += 1
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        skipped += 1
        continue
      }
      throw error
    }
  }

  return {
    total: result.rows.length,
    created,
    updated,
    skipped,
    subscriptionsSynced,
    subscriptionsSkipped,
    subscriptionsFailed,
  }
}

async function syncRemnashopSourceToCabinet(source: RemnashopUserRow, options: {
  forceRemnawaveSubscriptions?: boolean
  existingUserId?: string
}) {
  const telegramId = parseTelegramId(source.telegram_id)
  const email = source.email?.trim().toLowerCase() || null
  const existing = options.existingUserId
    ? await getLocalUserForRemnashopSync(options.existingUserId)
    : await findLocalUserForRemnashopSource({ sourceId: source.id, telegramId, email })

  let localUserId: string | null = null
  let localRemnawaveUuid: string | null = existing?.remnawaveUuid ?? null
  let localRemnawaveUsername: string | null = existing?.remnawaveUsername ?? null
  let localSubscriptionId: string | null = existing?.subscriptions[0]?.id ?? null
  let lastSubscriptionSyncedAt = existing?.subscriptions[0]?.lastSyncedAt ?? null
  let userAction: 'created' | 'updated' | 'skipped' = 'skipped'
  let subscriptionAction: 'synced' | 'skipped' | 'failed' | 'none' = 'none'

  if (existing) {
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        remnashopUserId: existing.remnashopUserId ?? source.id,
        remnashopSyncedAt: new Date(),
        telegramId: existing.telegramId ?? telegramId,
        telegramUsername: existing.telegramUsername ?? source.username,
        telegramLinkedAt: existing.telegramLinkedAt ?? (telegramId ? new Date() : null),
        name: existing.name ?? source.name,
        emailVerifiedAt:
          existing.emailVerifiedAt ?? (email === existing.email && source.is_email_verified ? new Date() : null),
      },
      select: {
        id: true,
        remnawaveUuid: true,
        remnawaveUsername: true,
        subscriptions: {
          orderBy: { expireAt: 'desc' },
          take: 1,
          select: { id: true, lastSyncedAt: true },
        },
      },
    })
    localUserId = user.id
    localRemnawaveUuid = user.remnawaveUuid
    localRemnawaveUsername = user.remnawaveUsername
    localSubscriptionId = user.subscriptions[0]?.id ?? localSubscriptionId
    lastSubscriptionSyncedAt = user.subscriptions[0]?.lastSyncedAt ?? lastSubscriptionSyncedAt
    userAction = 'updated'
  } else {
    if (!telegramId && !email) {
      return { userAction, subscriptionAction }
    }

    const user = await prisma.user.create({
      data: {
        email: email ?? `telegram-${telegramId!.toString()}@pending.invalid`,
        passwordHash: await hash(randomBytes(48).toString('base64url'), 12),
        name: source.name,
        role: 'USER',
        referralCode: await generateUniqueReferralCode(),
        telegramId,
        telegramUsername: source.username,
        telegramLinkedAt: telegramId ? new Date() : null,
        emailVerifiedAt: email && source.is_email_verified ? new Date() : null,
        remnashopUserId: source.id,
        remnashopSyncedAt: new Date(),
      },
      select: { id: true },
    })
    localUserId = user.id
    userAction = 'created'
  }

  if (!source.user_remna_id || !localUserId) return { userAction, subscriptionAction }
  if (!options.forceRemnawaveSubscriptions && !shouldSyncRemnawaveSubscription({
    sourceRemnawaveUuid: source.user_remna_id,
    localRemnawaveUuid,
    localRemnawaveUsername,
    localSubscriptionId,
    lastSubscriptionSyncedAt,
  })) {
    return { userAction, subscriptionAction: 'skipped' as const }
  }

  try {
    const planId = await resolveCabinetPlanIdFromRemnashopSubscription(source)
    if (!planId && source.subscription_plan_snapshot) {
      logWarn('remnashop.users.plan_match_failed', {
        remnashopUserId: source.id,
        remnawaveUuid: source.user_remna_id,
      })
    }
    await syncSubscriptionFromRemnawave({
      localUserId,
      remnashopUserId: source.id,
      remnawaveUuid: source.user_remna_id,
      telegramId,
      planId,
      startAt: source.subscription_created_at,
    })
    subscriptionAction = 'synced'
  } catch (error) {
    subscriptionAction = 'failed'
    logWarn('remnashop.users.subscription_sync_failed', {
      remnashopUserId: source.id,
      localUserId,
      remnawaveUuid: source.user_remna_id,
      message: error instanceof Error ? error.message : 'unknown error',
    })
  }

  return { userAction, subscriptionAction }
}

async function getLocalUserForRemnashopSync(localUserId: string) {
  return prisma.user.findUnique({
    where: { id: localUserId },
    select: localUserSelect,
  })
}

async function findLocalUserForRemnashopSource(input: {
  sourceId: number
  telegramId: bigint | null
  email: string | null
}) {
  return prisma.user.findFirst({
    where: {
      OR: [
        { remnashopUserId: input.sourceId },
        ...(input.telegramId ? [{ telegramId: input.telegramId }] : []),
        ...(input.email ? [{ email: input.email }] : []),
      ],
    },
    select: localUserSelect,
  })
}

const localUserSelect = {
  id: true,
  email: true,
  name: true,
  remnashopUserId: true,
  remnawaveUuid: true,
  remnawaveUsername: true,
  telegramId: true,
  telegramUsername: true,
  telegramLinkedAt: true,
  emailVerifiedAt: true,
  subscriptions: {
    orderBy: { expireAt: 'desc' as const },
    take: 1,
    select: { id: true, lastSyncedAt: true },
  },
}

async function findRemnashopSourceForLocalUser(user: LocalUserForRemnashopSync) {
  if (user.remnashopUserId) {
    const byId = await fetchRemnashopSources({
      whereSql: 'u.id = $1',
      values: [user.remnashopUserId],
      limit: 1,
    })
    if (byId.rows[0]) return byId.rows[0]
  }

  if (user.telegramId) {
    const byTelegram = await fetchRemnashopSources({
      whereSql: 'u.telegram_id::text = $1',
      values: [user.telegramId.toString()],
      limit: 1,
    })
    if (byTelegram.rows[0]) return byTelegram.rows[0]
  }

  if (!user.email.endsWith('@pending.invalid')) {
    const byEmail = await fetchRemnashopSources({
      whereSql: 'lower(u.email) = lower($1)',
      values: [user.email],
      limit: 1,
    })
    if (byEmail.rows[0]) return byEmail.rows[0]
  }

  return null
}

function fetchRemnashopSources(options: {
  whereSql?: string
  values?: unknown[]
  limit?: number
} = {}) {
  const whereSql = options.whereSql ?? 'TRUE'
  const limitSql = options.limit ? `LIMIT ${Math.max(1, Math.trunc(options.limit))}` : ''
  return remnashopQuery<RemnashopUserRow>(`
    SELECT
      u.id,
      u.telegram_id::text AS telegram_id,
      u.email,
      u.is_email_verified,
      u.name,
      u.username,
      COALESCE(current_s.user_remna_id, latest_s.user_remna_id)::text AS user_remna_id,
      COALESCE(current_s.created_at, latest_s.created_at) AS subscription_created_at,
      COALESCE(current_s.plan_snapshot, latest_s.plan_snapshot) AS subscription_plan_snapshot,
      COALESCE(current_s.traffic_limit, latest_s.traffic_limit)::int AS subscription_traffic_limit,
      COALESCE(current_s.device_limit, latest_s.device_limit)::int AS subscription_device_limit
    FROM users u
    LEFT JOIN subscriptions current_s ON current_s.id = u.current_subscription_id
    LEFT JOIN LATERAL (
      SELECT s.user_remna_id, s.created_at, s.plan_snapshot, s.traffic_limit, s.device_limit
      FROM subscriptions s
      WHERE s.user_id = u.id
        AND s.user_remna_id IS NOT NULL
        AND s.status::text = 'ACTIVE'
      ORDER BY s.expire_at DESC NULLS LAST, s.updated_at DESC
      LIMIT 1
    ) latest_s ON true
    WHERE ${whereSql}
    ORDER BY u.id
    ${limitSql}
  `, options.values ?? [])
}

function parseTelegramId(value: string | null) {
  if (!value) return null
  try {
    const parsed = BigInt(value)
    return parsed > 0n ? parsed : null
  } catch {
    return null
  }
}

async function syncSubscriptionFromRemnawave(input: {
  localUserId: string
  remnashopUserId: number
  remnawaveUuid: string
  telegramId: bigint | null
  planId: string | null
  startAt: Date | null
}) {
  let remnawaveUser = (await remnawave.getUserByUuid(input.remnawaveUuid)).response
  const telegramId = toRemnawaveTelegramId(input.telegramId)
  if (telegramId && remnawaveUser.telegramId !== telegramId) {
    remnawaveUser = (await remnawave.updateUser({
      uuid: remnawaveUser.uuid,
      telegramId,
      tag: 'IMPORTED',
    })).response
  }

  return upsertLocalSubscriptionFromRemnawave({
    localUserId: input.localUserId,
    remnashopUserId: input.remnashopUserId,
    planId: input.planId,
    startAt: input.startAt,
    remnawaveUser,
  })
}

async function resolveCabinetPlanIdFromRemnashopSubscription(source: RemnashopUserRow) {
  const candidates = getPlanCandidates(source)
  for (const candidate of candidates) {
    if (candidate.sourcePlanId) {
      const sourcePlan = await prisma.plan.findFirst({
        where: {
          remnashopPlanId: candidate.sourcePlanId,
          ...(candidate.durationDays ? { durationDays: candidate.durationDays } : {}),
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      if (sourcePlan) return sourcePlan.id
    }

    const names = normalizePlanNames(candidate.name, candidate.durationDays)
    const plan = names.length > 0
      ? await prisma.plan.findFirst({
          where: {
            ...(candidate.durationDays ? { durationDays: candidate.durationDays } : {}),
            OR: names.map((name) => ({ name })),
          },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
      : await prisma.plan.findFirst({
          where: {
            ...(candidate.durationDays ? { durationDays: candidate.durationDays } : {}),
            ...(candidate.trafficLimitGb !== undefined ? { trafficLimitGb: candidate.trafficLimitGb } : {}),
            ...(candidate.deviceLimit ? { deviceLimit: candidate.deviceLimit } : {}),
          },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
    if (plan) return plan.id
  }

  return null
}

function getPlanCandidates(source: RemnashopUserRow) {
  const snapshot = parseSnapshot(source.subscription_plan_snapshot)
  const names = snapshot ? extractPlanNames(snapshot) : []
  const sourcePlanId = snapshot ? extractPlanId(snapshot) : null
  const durationDays = snapshot ? extractDurationDays(snapshot) : null
  const trafficLimitGb = source.subscription_traffic_limit === null
    ? undefined
    : source.subscription_traffic_limit === 0
      ? null
      : source.subscription_traffic_limit
  const deviceLimit = source.subscription_device_limit || undefined

  const candidateNames: Array<string | null> = names.length > 0 ? names : [null]
  return candidateNames.map((name) => ({
    sourcePlanId,
    name,
    durationDays: durationDays ?? (name ? extractDurationDaysFromName(name) : null),
    trafficLimitGb,
    deviceLimit,
  })).filter((candidate) => candidate.name || candidate.durationDays || candidate.trafficLimitGb !== undefined)
}

function parseSnapshot(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string') return null

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function extractPlanId(snapshot: Record<string, unknown>) {
  return firstPositiveInt([
    readNumber(snapshot, ['id']),
    readNumber(snapshot, ['planId']),
    readNumber(snapshot, ['plan_id']),
    readNumber(snapshot, ['plan', 'id']),
    readNumber(snapshot, ['plan', 'planId']),
    readNumber(snapshot, ['plan', 'plan_id']),
  ])
}

function extractPlanNames(snapshot: Record<string, unknown>) {
  return uniqueStrings([
    readString(snapshot, ['name']),
    readString(snapshot, ['title']),
    readString(snapshot, ['planName']),
    readString(snapshot, ['plan_name']),
    readString(snapshot, ['plan', 'name']),
    readString(snapshot, ['plan', 'title']),
    readString(snapshot, ['plan', 'planName']),
    readString(snapshot, ['plan', 'plan_name']),
  ])
}

function extractDurationDays(snapshot: Record<string, unknown>) {
  return firstPositiveInt([
    readNumber(snapshot, ['durationDays']),
    readNumber(snapshot, ['duration_days']),
    readNumber(snapshot, ['duration']),
    readNumber(snapshot, ['days']),
    readNumber(snapshot, ['periodDays']),
    readNumber(snapshot, ['period_days']),
    readNumber(snapshot, ['duration', 'days']),
    readNumber(snapshot, ['duration', 'durationDays']),
    readNumber(snapshot, ['duration', 'duration_days']),
    readNumber(snapshot, ['planDuration', 'days']),
    readNumber(snapshot, ['plan_duration', 'days']),
  ])
}

function extractDurationDaysFromName(name: string | null) {
  if (!name) return null
  const match = name.match(/(\d+)\s*(?:дн|день|дня|дней|day|days)/i)
  return match ? Number(match[1]) : null
}

function normalizePlanNames(name: string | null, durationDays: number | null) {
  if (!name) return []
  const trimmed = name.trim()
  if (!trimmed) return []
  if (!durationDays || trimmed.includes(`${durationDays} дн.`)) return [trimmed]
  return [trimmed, `${trimmed} ${durationDays} дн.`]
}

function readString(source: Record<string, unknown>, path: string[]) {
  const value = readPath(source, path)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(source: Record<string, unknown>, path: string[]) {
  const value = readPath(source, path)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value)
  return null
}

function readPath(source: Record<string, unknown>, path: string[]) {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null
    return (current as Record<string, unknown>)[key]
  }, source)
}

function firstPositiveInt(values: Array<number | null>) {
  for (const value of values) {
    if (value && Number.isFinite(value) && value > 0) return Math.trunc(value)
  }
  return null
}

function uniqueStrings(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function shouldSyncRemnawaveSubscription(input: {
  sourceRemnawaveUuid: string
  localRemnawaveUuid: string | null
  localRemnawaveUsername: string | null
  localSubscriptionId: string | null
  lastSubscriptionSyncedAt: Date | null
}) {
  if (input.localRemnawaveUuid !== input.sourceRemnawaveUuid) return true
  if (!input.localRemnawaveUsername) return true
  if (!input.localSubscriptionId) return true
  if (!input.lastSubscriptionSyncedAt) return true

  const staleSeconds = Number(process.env.REMNASHOP_USER_SUBSCRIPTION_SYNC_STALE_SECONDS ?? 300)
  const staleMs = Math.max(60, Number.isFinite(staleSeconds) ? staleSeconds : 300) * 1000
  return Date.now() - input.lastSubscriptionSyncedAt.getTime() > staleMs
}
