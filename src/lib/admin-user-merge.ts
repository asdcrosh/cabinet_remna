import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit-log'

export type AdminMergeUsersInput = {
  sourceUserId: string
  targetUserId: string
  actorId: string
  request?: Request
}

export class AdminMergeUsersError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'AdminMergeUsersError'
  }
}

export async function mergeTechnicalTelegramUserIntoEmailUser(input: AdminMergeUsersInput) {
  if (input.sourceUserId === input.targetUserId) {
    throw new AdminMergeUsersError(400, 'Нельзя объединить пользователя с самим собой')
  }

  const summary = await prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.user.findUnique({ where: { id: input.sourceUserId } }),
      tx.user.findUnique({ where: { id: input.targetUserId } }),
    ])

    if (!source || !target) {
      throw new AdminMergeUsersError(404, 'Пользователь не найден')
    }
    if (isTechnicalTelegramUser(target.email)) {
      throw new AdminMergeUsersError(400, 'Целевой аккаунт должен быть email-аккаунтом')
    }
    if (source.role !== 'USER') {
      throw new AdminMergeUsersError(400, 'Нельзя объединять аккаунт с ролью выше пользователя')
    }

    const conflicts: string[] = []
    const termsConsent = pickLatestConsent(
      target.agreedToTermsAt,
      target.agreedToTermsVersion,
      source.agreedToTermsAt,
      source.agreedToTermsVersion
    )
    const personalDataConsent = pickLatestConsent(
      target.personalDataConsentAt,
      target.personalDataConsentVersion,
      source.personalDataConsentAt,
      source.personalDataConsentVersion
    )
    const targetData: Prisma.UserUpdateInput = {
      name: target.name || source.name,
      telegramId: pickUniqueField('telegramId', target.telegramId, source.telegramId, conflicts),
      telegramUsername: target.telegramUsername || source.telegramUsername,
      telegramLinkedAt: target.telegramLinkedAt || source.telegramLinkedAt,
      remnashopUserId: pickUniqueField('remnashopUserId', target.remnashopUserId, source.remnashopUserId, conflicts),
      remnashopSyncedAt: target.remnashopSyncedAt || source.remnashopSyncedAt,
      remnawaveUuid: pickUniqueField('remnawaveUuid', target.remnawaveUuid, source.remnawaveUuid, conflicts),
      remnawaveShortUuid: pickUniqueField('remnawaveShortUuid', target.remnawaveShortUuid, source.remnawaveShortUuid, conflicts),
      remnawaveUsername: pickUniqueField('remnawaveUsername', target.remnawaveUsername, source.remnawaveUsername, conflicts),
      agreedToTermsAt: termsConsent.at,
      agreedToTermsVersion: termsConsent.version,
      personalDataConsentAt: personalDataConsent.at,
      personalDataConsentVersion: personalDataConsent.version,
      emailVerifiedAt: target.emailVerifiedAt || source.emailVerifiedAt,
    }

    const transferred: Record<string, number> = {
      payments: await updateCount(tx.payment.updateMany({ where: { userId: source.id }, data: { userId: target.id } })),
      subscriptions: await updateCount(tx.subscription.updateMany({ where: { userId: source.id }, data: { userId: target.id } })),
      supportTickets: await updateCount(tx.supportTicket.updateMany({ where: { userId: source.id }, data: { userId: target.id } })),
      supportMessages: await updateCount(tx.supportMessage.updateMany({ where: { senderId: source.id }, data: { senderId: target.id } })),
      promoRedemptions: await updateCount(tx.promoCodeRedemption.updateMany({ where: { userId: source.id }, data: { userId: target.id } })),
      giftRedemptions: await updateCount(tx.giftCertificateRedemption.updateMany({ where: { userId: source.id }, data: { userId: target.id } })),
      notificationLogs: await updateCount(tx.notificationLog.updateMany({ where: { userId: source.id }, data: { userId: target.id } })),
      bonusOpenings: await updateCount(tx.bonusBoxOpening.updateMany({ where: { userId: source.id }, data: { userId: target.id } })),
      oauthAccounts: await updateCount(tx.oAuthAccount.updateMany({ where: { userId: source.id }, data: { userId: target.id } })),
      referrals: await updateCount(tx.user.updateMany({ where: { referredById: source.id }, data: { referredById: target.id } })),
      referralRewardsEarned: await updateCount(tx.referralReward.updateMany({ where: { referrerId: source.id }, data: { referrerId: target.id } })),
    }

    transferred.devices = await transferDevices(tx, source.id, target.id)
    transferred.trialRedemptions = await transferTrialRedemptions(tx, source.id, target.id)
    transferred.welcomeBonusRedemptions = await transferWelcomeBonusRedemptions(tx, source.id, target.id)
    transferred.bonusAttempts = await transferBonusAttempts(tx, source.id, target.id)
    transferred.notifications = await transferUserNotifications(tx, source.id, target.id)
    transferred.adminReads = await transferAdminNotificationReads(tx, source.id, target.id)

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

    await tx.user.update({ where: { id: target.id }, data: targetData })
    await tx.user.update({
      where: { id: source.id },
      data: {
        email: `merged-${source.id}@pending.invalid`,
        name: `Объединён с ${target.email}`,
        telegramUsername: null,
        telegramLinkedAt: null,
        remnashopSyncedAt: null,
        referredById: null,
      },
    })

    return { sourceEmail: source.email, targetEmail: target.email, conflicts, transferred }
  })

  await writeAuditLog({
    actorId: input.actorId,
    targetId: input.targetUserId,
    action: 'ADMIN_USERS_MERGED',
    message: `Объединены аккаунты ${summary.sourceEmail} → ${summary.targetEmail}`,
    metadata: summary,
    request: input.request,
  })

  return summary
}

function pickLatestConsent(
  targetAt: Date | null,
  targetVersion: string | null,
  sourceAt: Date | null,
  sourceVersion: string | null
) {
  if (!targetAt) return { at: sourceAt, version: sourceVersion }
  if (sourceAt && sourceAt > targetAt) return { at: sourceAt, version: sourceVersion }
  return { at: targetAt, version: targetVersion }
}

function isTechnicalTelegramUser(email: string) {
  return email.startsWith('telegram-') && email.endsWith('@pending.invalid')
}

function pickUniqueField<T>(name: string, targetValue: T | null, sourceValue: T | null, conflicts: string[]) {
  if (targetValue != null && sourceValue != null && targetValue !== sourceValue) {
    conflicts.push(name)
    return targetValue
  }
  return targetValue ?? sourceValue ?? null
}

async function updateCount(promise: Promise<{ count: number }>) {
  return (await promise).count
}

async function transferDevices(tx: Prisma.TransactionClient, sourceUserId: string, targetUserId: string) {
  const sourceItems = await tx.device.findMany({ where: { userId: sourceUserId }, select: { id: true, hwid: true } })
  const targetHwids = new Set(
    (await tx.device.findMany({ where: { userId: targetUserId }, select: { hwid: true } })).map((item) => item.hwid)
  )
  let count = 0
  for (const item of sourceItems) {
    if (targetHwids.has(item.hwid)) {
      await tx.device.delete({ where: { id: item.id } })
    } else {
      await tx.device.update({ where: { id: item.id }, data: { userId: targetUserId } })
      count += 1
    }
  }
  return count
}

async function transferTrialRedemptions(tx: Prisma.TransactionClient, sourceUserId: string, targetUserId: string) {
  const sourceItems = await tx.trialPlanRedemption.findMany({ where: { userId: sourceUserId }, select: { id: true, planId: true } })
  const targetPlanIds = new Set(
    (await tx.trialPlanRedemption.findMany({ where: { userId: targetUserId }, select: { planId: true } })).map((item) => item.planId)
  )
  let count = 0
  for (const item of sourceItems) {
    if (targetPlanIds.has(item.planId)) {
      await tx.trialPlanRedemption.delete({ where: { id: item.id } })
    } else {
      await tx.trialPlanRedemption.update({ where: { id: item.id }, data: { userId: targetUserId } })
      count += 1
    }
  }
  return count
}

async function transferWelcomeBonusRedemptions(tx: Prisma.TransactionClient, sourceUserId: string, targetUserId: string) {
  const sourceItem = await tx.welcomeBonusRedemption.findUnique({ where: { userId: sourceUserId }, select: { id: true } })
  if (!sourceItem) return 0

  const targetItem = await tx.welcomeBonusRedemption.findUnique({ where: { userId: targetUserId }, select: { id: true } })
  if (targetItem) {
    await tx.welcomeBonusRedemption.delete({ where: { id: sourceItem.id } })
    return 0
  }

  await tx.welcomeBonusRedemption.update({ where: { id: sourceItem.id }, data: { userId: targetUserId } })
  return 1
}

async function transferBonusAttempts(tx: Prisma.TransactionClient, sourceUserId: string, targetUserId: string) {
  const sourceItems = await tx.bonusBoxAttempt.findMany({
    where: { userId: sourceUserId },
    select: { id: true, source: true, sourceKey: true },
  })
  const targetKeys = new Set(
    (await tx.bonusBoxAttempt.findMany({ where: { userId: targetUserId }, select: { source: true, sourceKey: true } }))
      .map((item) => `${item.source}:${item.sourceKey}`)
  )
  let count = 0
  for (const item of sourceItems) {
    const key = `${item.source}:${item.sourceKey}`
    if (targetKeys.has(key)) {
      await tx.bonusBoxAttempt.delete({ where: { id: item.id } })
    } else {
      await tx.bonusBoxAttempt.update({ where: { id: item.id }, data: { userId: targetUserId } })
      count += 1
    }
  }
  return count
}

async function transferUserNotifications(tx: Prisma.TransactionClient, sourceUserId: string, targetUserId: string) {
  const sourceItems = await tx.userNotification.findMany({ where: { userId: sourceUserId }, select: { id: true, dedupeKey: true } })
  const targetKeys = new Set(
    (await tx.userNotification.findMany({ where: { userId: targetUserId }, select: { dedupeKey: true } })).map((item) => item.dedupeKey)
  )
  let count = 0
  for (const item of sourceItems) {
    if (targetKeys.has(item.dedupeKey)) {
      await tx.userNotification.delete({ where: { id: item.id } })
    } else {
      await tx.userNotification.update({ where: { id: item.id }, data: { userId: targetUserId } })
      count += 1
    }
  }
  return count
}

async function transferAdminNotificationReads(tx: Prisma.TransactionClient, sourceUserId: string, targetUserId: string) {
  const sourceItems = await tx.adminNotificationRead.findMany({
    where: { userId: sourceUserId },
    select: { id: true, notificationId: true },
  })
  const targetKeys = new Set(
    (await tx.adminNotificationRead.findMany({ where: { userId: targetUserId }, select: { notificationId: true } }))
      .map((item) => item.notificationId)
  )
  let count = 0
  for (const item of sourceItems) {
    if (targetKeys.has(item.notificationId)) {
      await tx.adminNotificationRead.delete({ where: { id: item.id } })
    } else {
      await tx.adminNotificationRead.update({ where: { id: item.id }, data: { userId: targetUserId } })
      count += 1
    }
  }
  return count
}
