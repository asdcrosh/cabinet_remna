import type { Prisma, PromoReminderChannel } from '@prisma/client'
import { hasVerifiedEmail } from './auth/mobile-email-policy'
import { logInfo, logWarn } from './logger'
import { sendPromoReminderExternal } from './notifications'
import { prisma } from './prisma'
import { promoReminderRecipients, resolvePromoReminderCheckout } from './promo-reminder-checkout'
import { sendPushToUser } from './push'

const DAY_MS = 24 * 60 * 60 * 1000
const RETRY_DELAY_MS = 5 * 60 * 1000
const TYPE = 'PROMO_CODE_EXPIRING' as const
const ACTION_LABEL = 'Использовать скидку'
const expiryFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
})

export async function reconcilePromoExpiryReminders(options?: {
  now?: Date
  batchSize?: number
  shouldStop?: () => boolean
}) {
  const now = () => options?.now ?? new Date()
  const startedAt = now()
  const shouldStop = options?.shouldStop ?? (() => false)
  const batchSize = options?.batchSize ?? 100
  const result = { checked: 0, sent: 0, failed: 0 }

  // Внешний сервис мог принять запрос до того, как воркер успел записать результат.
  await prisma.promoCodeReminder.updateMany({
    where: { status: 'SENDING', updatedAt: { lt: new Date(startedAt.getTime() - RETRY_DELAY_MS) } },
    data: { status: 'UNKNOWN' },
  })

  let promoCursor: string | undefined
  while (!shouldStop()) {
    const promos = await prisma.promoCode.findMany({
      where: {
        id: { gt: promoCursor },
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: startedAt } }],
        expiresAt: { gt: startedAt, lte: new Date(startedAt.getTime() + DAY_MS) },
      },
      select: { id: true, audience: true, allowedEmails: true },
      orderBy: { id: 'asc' },
      take: batchSize,
    })
    if (promos.length === 0) break
    promoCursor = promos.at(-1)?.id

    for (const promo of promos) {
      if (shouldStop()) break
      let userCursor: string | undefined
      while (!shouldStop()) {
        const recipients = await prisma.user.findMany({
          where: {
            id: { gt: userCursor },
            ...promoReminderRecipients(promo.id, promo.audience === 'PERSONAL' ? promo.allowedEmails : []),
            NOT: { notificationPreference: { is: { broadcastsEnabled: false } } },
            promoCodeReminders: {
              none: { promoCodeId: promo.id, OR: [{ status: { not: 'PENDING' } }, { nextAttemptAt: { gt: startedAt } }] },
            },
          },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: batchSize,
        })
        if (recipients.length === 0) break
        userCursor = recipients.at(-1)?.id
        for (const user of recipients) {
          if (shouldStop()) break
          result.checked++
          try {
            if (await deliverReminder(user.id, promo.id, now)) result.sent++
          } catch (error) {
            result.failed++
            logWarn('promo_expiry.reminder_failed', { userId: user.id, promoId: promo.id, errorType: error instanceof Error ? error.name : 'unknown' })
          }
        }
      }
    }
  }
  return result
}

async function deliverReminder(userId: string, promoCodeId: string, now: () => Date) {
  const reminder = await resolvePromoReminderCheckout(userId, promoCodeId, now())
  if (!reminder.code) return false
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      telegramId: true, email: true, emailVerifiedAt: true,
      notificationPreference: true,
      mobileSessions: {
        where: { revokedAt: null, expiresAt: { gt: now() } },
        select: { id: true }, take: 1,
      },
    },
  })
  if (!user || user.notificationPreference?.broadcastsEnabled === false) return false
  const preferences = user.notificationPreference
  const channels: PromoReminderChannel[] = []
  if (preferences?.inAppEnabled !== false && user.mobileSessions.length > 0) channels.push('APP')
  if (preferences?.telegramEnabled !== false && user.telegramId && process.env.TELEGRAM_BOT_TOKEN?.trim()) channels.push('TELEGRAM')
  if (preferences?.emailEnabled !== false && hasVerifiedEmail(user) && process.env.EMAIL_VERIFICATION_WEBHOOK_URL?.trim()) channels.push('EMAIL')
  if (channels.length === 0) return false

  const identity = { userId, promoCodeId }
  await prisma.promoCodeReminder.createMany({ data: { ...identity, nextAttemptAt: now() }, skipDuplicates: true })
  const state = await prisma.promoCodeReminder.findUnique({ where: { userId_promoCodeId: identity } })
  if (!state || state.status !== 'PENDING' || state.nextAttemptAt > now()) return false
  let pendingChannel = state.channel
  const actionHref = '/dashboard/plans?' + new URLSearchParams({ promoId: promoCodeId }).toString()
  const title = `Ваша скидка ${reminder.discountPercent}% скоро сгорит`
  const deadline = expiryFormat.format(reminder.expiresAt)
  const action = reminder.renewalOnly ? 'при продлении подписки' : 'при покупке или продлении подписки'
  const body = `Промокод действует до ${deadline} мск. Используйте скидку ${action}.`
  const notification = { userId, type: TYPE, title, body, actionHref, actionLabel: ACTION_LABEL }

  for (const channel of channels) {
    if (pendingChannel === 'EMAIL' && channel !== 'EMAIL') continue
    const currentTime = now()
    if (currentTime >= reminder.expiresAt) return false
    const pending: Prisma.PromoCodeReminderWhereInput = {
      ...identity, status: 'PENDING', channel: pendingChannel, nextAttemptAt: { lte: currentTime },
    }
    if (channel === 'APP') {
      const recorded = await prisma.$transaction(async (tx) => {
        const claim = await tx.promoCodeReminder.updateMany({
          where: pending, data: { status: 'SENT', channel },
        })
        if (claim.count === 0) return false
        const created = await tx.userNotification.createMany({
          data: { ...notification, dedupeKey: `${TYPE}:${promoCodeId}` },
          skipDuplicates: true,
        })
        return created.count > 0
      })
      if (recorded) {
        await sendPushToUser({ ...notification, singleDevice: true, expiresAt: reminder.expiresAt })
        logInfo('promo_expiry.delivery', { ...identity, channel, result: 'sent' })
      }
      return recorded
    }

    const claim = await prisma.promoCodeReminder.updateMany({
      where: pending, data: { status: 'SENDING', channel },
    })
    if (claim.count === 0) return false

    const result = await sendPromoReminderExternal(
      channel === 'TELEGRAM' ? { channel, telegramId: user.telegramId! } : { channel, email: user.email },
      notification,
    )
    const canFallback = channel === 'TELEGRAM' && result === 'unavailable' && channels.includes('EMAIL')
    const status = result === 'sent' ? 'SENT'
      : result === 'unknown' ? 'UNKNOWN'
      : result === 'retry' || canFallback ? 'PENDING' : 'SKIPPED'
    const updated = await prisma.promoCodeReminder.updateMany({
      where: { ...identity, status: 'SENDING', channel },
      data: {
        status,
        channel: canFallback ? 'EMAIL' : channel,
        nextAttemptAt: new Date(now().getTime() + (result === 'retry' ? RETRY_DELAY_MS : 0)),
      },
    })
    logInfo('promo_expiry.delivery', { ...identity, channel, result })
    if (!canFallback || updated.count === 0) return result === 'sent'
    pendingChannel = 'EMAIL'
  }
  return false
}
