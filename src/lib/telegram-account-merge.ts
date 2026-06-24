import { prisma } from './prisma'
import { remnashopQuery } from './remnashop-db'

export class TelegramAccountMergeError extends Error {
  constructor(public code: 'TELEGRAM_ALREADY_LINKED' | 'IDENTITY_CONFLICT') {
    super(code)
    this.name = 'TelegramAccountMergeError'
  }
}

export async function mergeTechnicalTelegramAccount(input: {
  targetUserId: string
  telegramId: bigint
  telegramUsername: string | null
  telegramName: string | null
}) {
  const [target, source] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.targetUserId } }),
    prisma.user.findUnique({
      where: { telegramId: input.telegramId },
      include: {
        referralRewardAsReferred: { select: { id: true } },
        _count: {
          select: {
            payments: true,
            devices: true,
            supportTickets: true,
            supportMessages: true,
            promoCodeRedemptions: true,
            trialPlanRedemptions: true,
            referrals: true,
            referralRewardsEarned: true,
            bonusBoxAttempts: true,
            bonusBoxOpenings: true,
          },
        },
      },
    }),
  ])

  if (!target) throw new TelegramAccountMergeError('IDENTITY_CONFLICT')
  if (!source || source.id === target.id) return { merged: false as const }

  const hasOwnedActivity = Object.values(source._count).some((count) => count > 0)
  const isTechnical =
    source.role === 'USER' &&
    source.email.endsWith('@pending.invalid') &&
    !source.emailVerifiedAt &&
    !source.referredById &&
    !source.referralRewardAsReferred

  if (!isTechnical || hasOwnedActivity) {
    throw new TelegramAccountMergeError('TELEGRAM_ALREADY_LINKED')
  }

  const identityPairs = [
    [target.remnawaveUuid, source.remnawaveUuid],
    [target.remnawaveShortUuid, source.remnawaveShortUuid],
    [target.remnawaveUsername, source.remnawaveUsername],
  ]
  if (identityPairs.some(([current, incoming]) => current && incoming && current !== incoming)) {
    throw new TelegramAccountMergeError('IDENTITY_CONFLICT')
  }
  const remnashopUserId = await resolveRemnashopIdentity(
    target.remnashopUserId,
    source.remnashopUserId
  )

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: source.id },
      data: {
        telegramId: null,
        remnashopUserId: null,
        remnawaveUuid: null,
        remnawaveShortUuid: null,
        remnawaveUsername: null,
      },
    })
    await tx.subscription.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    })
    await tx.user.update({
      where: { id: target.id },
      data: {
        telegramId: input.telegramId,
        telegramUsername: input.telegramUsername ?? source.telegramUsername,
        telegramLinkedAt: new Date(),
        name: target.name ?? input.telegramName ?? source.name,
        remnashopUserId,
        remnashopSyncedAt: source.remnashopSyncedAt ?? target.remnashopSyncedAt,
        remnawaveUuid: target.remnawaveUuid ?? source.remnawaveUuid,
        remnawaveShortUuid: target.remnawaveShortUuid ?? source.remnawaveShortUuid,
        remnawaveUsername: target.remnawaveUsername ?? source.remnawaveUsername,
      },
    })
    await tx.user.delete({ where: { id: source.id } })
  })

  return { merged: true as const, sourceUserId: source.id }
}

async function resolveRemnashopIdentity(targetId: number | null, sourceId: number | null) {
  if (!targetId || !sourceId || targetId === sourceId) return sourceId ?? targetId
  if (!process.env.REMNASHOP_DATABASE_URL) return sourceId

  const result = await remnashopQuery<{
    id: number
    current_subscription_id: number | null
  }>(
    `
      SELECT id, current_subscription_id
      FROM users
      WHERE id = ANY($1::int[])
    `,
    [[targetId, sourceId]]
  )
  const target = result.rows.find((row) => row.id === targetId)
  const source = result.rows.find((row) => row.id === sourceId)
  if (target?.current_subscription_id && source?.current_subscription_id) {
    throw new TelegramAccountMergeError('IDENTITY_CONFLICT')
  }

  // The Telegram identity remains canonical in Remnashop. A duplicate empty
  // email-only Remnashop row can stay orphaned without losing subscriptions.
  return sourceId
}
