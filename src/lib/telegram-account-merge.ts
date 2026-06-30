import { prisma } from './prisma'
import { remnashopQuery } from './remnashop-db'

export class TelegramAccountMergeError extends Error {
  constructor(public code: 'TELEGRAM_ALREADY_LINKED' | 'IDENTITY_CONFLICT' | 'PRIVILEGED_SOURCE') {
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
    prisma.user.findUnique({
      where: { id: input.targetUserId },
      include: {
        referralRewardAsReferred: { select: { id: true } },
      },
    }),
    prisma.user.findUnique({
      where: { telegramId: input.telegramId },
      include: {
        referralRewardAsReferred: { select: { id: true } },
      },
    }),
  ])

  if (!target) throw new TelegramAccountMergeError('IDENTITY_CONFLICT')
  if (!source || source.id === target.id) return { merged: false as const }

  const isTechnicalSource =
    source.role === 'USER' &&
    source.email.endsWith('@pending.invalid') &&
    !source.emailVerifiedAt

  if (source.role !== 'USER') {
    throw new TelegramAccountMergeError('PRIVILEGED_SOURCE')
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
    await tx.payment.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    })
    await tx.device.deleteMany({
      where: {
        userId: source.id,
        hwid: {
          in: (await tx.device.findMany({
            where: { userId: target.id },
            select: { hwid: true },
          })).map((device) => device.hwid),
        },
      },
    })
    await tx.device.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    })
    await tx.supportTicket.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    })
    await tx.supportMessage.updateMany({
      where: { senderId: source.id },
      data: { senderId: target.id },
    })
    await tx.promoCodeRedemption.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    })
    await tx.giftCertificateRedemption.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    })
    await tx.notificationLog.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    })
    await tx.oAuthAccount.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    })
    const targetTrialPlans = await tx.trialPlanRedemption.findMany({
      where: { userId: target.id },
      select: { planId: true },
    })
    await tx.trialPlanRedemption.deleteMany({
      where: {
        userId: source.id,
        planId: { in: targetTrialPlans.map((redemption) => redemption.planId) },
      },
    })
    await tx.trialPlanRedemption.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    })
    await tx.user.updateMany({
      where: { referredById: source.id },
      data: { referredById: target.id },
    })
    await tx.referralReward.updateMany({
      where: { referrerId: source.id },
      data: { referrerId: target.id },
    })
    if (source.referralRewardAsReferred) {
      if (target.referralRewardAsReferred) {
        await tx.referralReward.delete({
          where: { id: source.referralRewardAsReferred.id },
        })
      } else {
        await tx.referralReward.update({
          where: { id: source.referralRewardAsReferred.id },
          data: { referredUserId: target.id },
        })
      }
    }
    const targetAttempts = await tx.bonusBoxAttempt.findMany({
      where: { userId: target.id },
      select: { source: true, sourceKey: true },
    })
    for (const attempt of targetAttempts) {
      await tx.bonusBoxAttempt.deleteMany({
        where: {
          userId: source.id,
          source: attempt.source,
          sourceKey: attempt.sourceKey,
        },
      })
    }
    await tx.bonusBoxAttempt.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    })
    await tx.bonusBoxOpening.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    })
    const sourceWelcomeBonus = await tx.welcomeBonusRedemption.findUnique({
      where: { userId: source.id },
      select: { id: true },
    })
    if (sourceWelcomeBonus) {
      const targetWelcomeBonus = await tx.welcomeBonusRedemption.findUnique({
        where: { userId: target.id },
        select: { id: true },
      })
      if (targetWelcomeBonus) {
        await tx.welcomeBonusRedemption.delete({ where: { id: sourceWelcomeBonus.id } })
      } else {
        await tx.welcomeBonusRedemption.update({
          where: { id: sourceWelcomeBonus.id },
          data: { userId: target.id },
        })
      }
    }
    const targetNotifications = await tx.userNotification.findMany({
      where: { userId: target.id },
      select: { dedupeKey: true },
    })
    for (const notification of targetNotifications) {
      await tx.userNotification.deleteMany({
        where: {
          userId: source.id,
          dedupeKey: notification.dedupeKey,
        },
      })
    }
    await tx.userNotification.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    })
    const targetAdminReads = await tx.adminNotificationRead.findMany({
      where: { userId: target.id },
      select: { notificationId: true },
    })
    for (const read of targetAdminReads) {
      await tx.adminNotificationRead.deleteMany({
        where: {
          userId: source.id,
          notificationId: read.notificationId,
        },
      })
    }
    await tx.adminNotificationRead.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    })
    await tx.emailVerificationToken.deleteMany({ where: { userId: source.id } })
    await tx.passwordResetToken.deleteMany({ where: { userId: source.id } })
    await tx.user.update({
      where: { id: target.id },
      data: {
        telegramId: input.telegramId,
        telegramUsername: input.telegramUsername ?? source.telegramUsername,
        telegramLinkedAt: new Date(),
        name: target.name ?? input.telegramName ?? source.name,
        remnashopUserId,
        remnashopSyncedAt: source.remnashopSyncedAt ?? target.remnashopSyncedAt,
        remnawaveUuid: source.remnawaveUuid ?? target.remnawaveUuid,
        remnawaveShortUuid: source.remnawaveShortUuid ?? target.remnawaveShortUuid,
        remnawaveUsername: source.remnawaveUsername ?? target.remnawaveUsername,
        referredById: target.referredById ?? source.referredById,
      },
    })
    if (isTechnicalSource) {
      await tx.user.delete({ where: { id: source.id } })
    } else {
      await tx.user.update({
        where: { id: source.id },
        data: {
          email: `merged-${source.id}@pending.invalid`,
          name: `Объединён с ${target.email}`,
          telegramUsername: null,
          telegramLinkedAt: null,
          remnashopSyncedAt: null,
          referredById: null,
          emailVerifiedAt: null,
        },
      })
    }
  })

  return { merged: true as const, sourceUserId: source.id, sourceWasTechnical: isTechnicalSource }
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
  if (source?.current_subscription_id) return sourceId
  if (target?.current_subscription_id) return targetId

  // Без подписок Telegram-профиль остаётся каноническим для будущей синхронизации.
  return sourceId
}
