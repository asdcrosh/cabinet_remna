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

interface RemnashopUserRow {
  id: number
  telegram_id: string | null
  email: string | null
  is_email_verified: boolean
  name: string
  username: string | null
  user_remna_id: string | null
}

export async function findRemnashopUserByEmail(email: string) {
  const result = await remnashopQuery<RemnashopUserRow>(
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

export async function syncRemnashopUsersToCabinet() {
  const result = await remnashopQuery<RemnashopUserRow>(`
    SELECT
      u.id,
      u.telegram_id::text AS telegram_id,
      u.email,
      u.is_email_verified,
      u.name,
      u.username,
      COALESCE(current_s.user_remna_id, latest_s.user_remna_id)::text AS user_remna_id
    FROM users u
    LEFT JOIN subscriptions current_s ON current_s.id = u.current_subscription_id
    LEFT JOIN LATERAL (
      SELECT s.user_remna_id
      FROM subscriptions s
      WHERE s.user_id = u.id
        AND s.user_remna_id IS NOT NULL
        AND s.status::text = 'ACTIVE'
      ORDER BY s.expire_at DESC NULLS LAST, s.updated_at DESC
      LIMIT 1
    ) latest_s ON true
    ORDER BY u.id
  `)
  let created = 0
  let updated = 0
  let skipped = 0
  let subscriptionsSynced = 0
  let subscriptionsSkipped = 0
  let subscriptionsFailed = 0

  for (const source of result.rows) {
    const telegramId = source.telegram_id ? BigInt(source.telegram_id) : null
    const email = source.email?.trim().toLowerCase() || null
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { remnashopUserId: source.id },
          ...(telegramId ? [{ telegramId }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        remnashopUserId: true,
        remnawaveUuid: true,
        telegramId: true,
        telegramUsername: true,
        telegramLinkedAt: true,
        emailVerifiedAt: true,
        subscriptions: {
          orderBy: { expireAt: 'desc' },
          take: 1,
          select: { id: true, lastSyncedAt: true },
        },
      },
    })

    try {
      let localUserId: string | null = null
      let localRemnawaveUuid: string | null = existing?.remnawaveUuid ?? null
      let lastSubscriptionSyncedAt = existing?.subscriptions[0]?.lastSyncedAt ?? null

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
            subscriptions: {
              orderBy: { expireAt: 'desc' },
              take: 1,
              select: { lastSyncedAt: true },
            },
          },
        })
        localUserId = user.id
        localRemnawaveUuid = user.remnawaveUuid
        lastSubscriptionSyncedAt = user.subscriptions[0]?.lastSyncedAt ?? lastSubscriptionSyncedAt
        updated += 1
      } else {
        if (!telegramId && !email) {
          skipped += 1
          continue
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
        created += 1
      }

      if (!source.user_remna_id || !localUserId) continue
      if (!shouldSyncRemnawaveSubscription({
        sourceRemnawaveUuid: source.user_remna_id,
        localRemnawaveUuid,
        lastSubscriptionSyncedAt,
      })) {
        subscriptionsSkipped += 1
        continue
      }

      try {
        await syncSubscriptionFromRemnawave({
          localUserId,
          remnashopUserId: source.id,
          remnawaveUuid: source.user_remna_id,
          telegramId,
        })
        subscriptionsSynced += 1
      } catch (error) {
        subscriptionsFailed += 1
        logWarn('remnashop.users.subscription_sync_failed', {
          remnashopUserId: source.id,
          localUserId,
          remnawaveUuid: source.user_remna_id,
          message: error instanceof Error ? error.message : 'unknown error',
        })
      }
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

async function syncSubscriptionFromRemnawave(input: {
  localUserId: string
  remnashopUserId: number
  remnawaveUuid: string
  telegramId: bigint | null
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
    remnawaveUser,
  })
}

function shouldSyncRemnawaveSubscription(input: {
  sourceRemnawaveUuid: string
  localRemnawaveUuid: string | null
  lastSubscriptionSyncedAt: Date | null
}) {
  if (input.localRemnawaveUuid !== input.sourceRemnawaveUuid) return true
  if (!input.lastSubscriptionSyncedAt) return true

  const staleSeconds = Number(process.env.REMNASHOP_USER_SUBSCRIPTION_SYNC_STALE_SECONDS ?? 300)
  const staleMs = Math.max(60, Number.isFinite(staleSeconds) ? staleSeconds : 300) * 1000
  return Date.now() - input.lastSubscriptionSyncedAt.getTime() > staleMs
}
