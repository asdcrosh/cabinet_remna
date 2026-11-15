import { Prisma } from '@prisma/client'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { AuthError } from '@/lib/auth/guard'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { withDistributedLock } from '@/lib/distributed-lock'
import { buildPlanPurchaseSnapshot, calculatePlanPurchase } from '@/lib/plan-purchase'
import { escapeTelegramHtml as escape } from '@/lib/telegram-format'
import { miniAppBotCall } from './bot-api'

export function isChannelReference(value: string) {
  return /^-100\d+$/.test(value) || /^@[A-Za-z0-9_]{5,32}$/.test(value)
}

export function channelCampaign() {
  if (process.env.TELEGRAM_CHANNEL_REWARDS_ENABLED !== 'true') return null
  const channelId = process.env.TELEGRAM_REWARD_CHANNEL_ID || ''
  const channelUrl = process.env.TELEGRAM_REWARD_CHANNEL_URL || ''
  const planId = process.env.TELEGRAM_REWARD_PLAN_ID || ''
  const referrerDays = Number(process.env.TELEGRAM_REWARD_REFERRER_DAYS)
  const referredDays = Number(process.env.TELEGRAM_REWARD_REFERRED_DAYS)
  const cap = Number(process.env.TELEGRAM_REWARD_MAX_PER_REFERRER)
  // Промокод пригласившему за каждого вступившего друга (по умолчанию −30%).
  const referrerPromoPercent = Number(process.env.TELEGRAM_REWARD_REFERRER_PROMO_PERCENT || '30')
  if (!isChannelReference(channelId) || !/^https:\/\/t\.me\/[a-zA-Z0-9_+/-]+$/.test(channelUrl)
      || (channelId.startsWith('@') && channelUrl.toLowerCase() !== `https://t.me/${channelId.slice(1)}`.toLowerCase()) || !planId
      || !Number.isInteger(referrerDays) || referrerDays < 1 || referrerDays > 365
      || !Number.isInteger(referredDays) || referredDays < 0 || referredDays > 365
      || !Number.isInteger(cap) || cap < 1 || cap > 1000
      || !Number.isInteger(referrerPromoPercent) || referrerPromoPercent < 1 || referrerPromoPercent > 99) throw new Error('Channel rewards configuration is incomplete')
  return { channelId, channelUrl, planId, referrerDays, referredDays, cap, referrerPromoPercent }
}

export function isChannelMember(value: { status: string; is_member?: boolean }) {
  return ['member', 'administrator', 'creator'].includes(value.status) || (value.status === 'restricted' && value.is_member === true)
}

async function resolveChannelId(reference: string) {
  const chat = await miniAppBotCall<{ id: number; type: string; username?: string }>('getChat', { chat_id: reference })
  if (chat.type !== 'channel' || !Number.isSafeInteger(chat.id) || !String(chat.id).startsWith('-100')
      || (reference.startsWith('@') && chat.username?.toLowerCase() !== reference.slice(1).toLowerCase())) {
    throw new AuthError(503, 'Проверка канала временно недоступна')
  }
  return String(chat.id)
}

async function membership(channelId: string, telegramId: bigint) {
  // Telegram only guarantees getChatMember for other users when this bot is an administrator.
  const me = await miniAppBotCall<{ id: number }>('getMe', {})
  const bot = await miniAppBotCall<{ status: string }>('getChatMember', { chat_id: channelId, user_id: me.id })
  if (!['administrator', 'creator'].includes(bot.status)) throw new AuthError(503, 'Проверка канала временно недоступна')
  return miniAppBotCall<{ status: string; is_member?: boolean }>('getChatMember', { chat_id: channelId, user_id: telegramId.toString() })
}

// Called only for a newly created account; existing members and existing accounts cannot attach invitations retrospectively.
export async function captureChannelReferral(userId: string, telegramId: bigint, code: unknown) {
  const campaign = channelCampaign()
  if (!campaign || typeof code !== 'string' || !/^[A-Z0-9]{6,8}$/.test(code) || !await isFeatureEnabled('referrals')) return
  const referrer = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true, telegramId: true } })
  if (!referrer?.telegramId || referrer.id === userId || referrer.telegramId === telegramId) return
  const channelId = await resolveChannelId(campaign.channelId)
  const member = await membership(channelId, telegramId)
  await prisma.telegramChannelReferral.upsert({
    where: { referredTelegramId: telegramId },
    create: { referredTelegramId: telegramId, referredUserId: userId, referrerId: referrer.id,
      channelId, eligible: !isChannelMember(member) && member.status === 'left' },
    update: {},
  })
}

export async function claimChannelReward(userId: string) {
  const campaign = channelCampaign()
  if (!campaign || !await isFeatureEnabled('referrals')) throw new AuthError(404, 'Программа пока не включена')
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { telegramId: true } })
  if (!user?.telegramId) throw new AuthError(403, 'Войдите через Telegram')
  const channelId = await resolveChannelId(campaign.channelId)
  const invitation = await prisma.telegramChannelReferral.findUnique({ where: { referredTelegramId: user.telegramId } })
  if (!invitation || invitation.referredUserId !== userId || invitation.channelId !== channelId || !invitation.eligible) {
    throw new AuthError(422, 'Бонус доступен новым пользователям, которые пришли по приглашению до вступления в канал')
  }
  if (invitation.claimedAt) return { claimed: true, alreadyClaimed: true }
  if (!isChannelMember(await membership(channelId, user.telegramId))) throw new AuthError(422, 'Сначала вступите в канал, затем повторите проверку')
  const locked = await withDistributedLock(`channel-referrer:${invitation.referrerId}`, () => prisma.$transaction(async (tx) => {
    const fresh = await tx.telegramChannelReferral.findUnique({ where: { referredTelegramId: user.telegramId! } })
    if (fresh?.claimedAt) return { claimed: true, alreadyClaimed: true }
    const used = await tx.telegramChannelReferral.count({ where: { referrerId: invitation.referrerId, claimedAt: { not: null } } })
    if (used >= campaign.cap) throw new AuthError(422, 'Лимит бонусов по этому приглашению достигнут')
    const basePlan = await tx.plan.findUnique({ where: { id: campaign.planId } })
    if (!basePlan?.isActive) throw new AuthError(503, 'Бонусный тариф временно недоступен')
    const referrer = await tx.user.findUnique({ where: { id: invitation.referrerId }, select: { id: true, email: true, telegramId: true } })
    if (!referrer) throw new AuthError(422, 'Аккаунт участника приглашения недоступен')
    const payments: string[] = []
    for (const [recipientId, days] of [[invitation.referrerId, campaign.referrerDays], [userId, campaign.referredDays]] as const) {
      if (days === 0) { payments.push(''); continue }
      const recipient = await tx.user.findUnique({ where: { id: recipientId }, select: { id: true } })
      if (!recipient) throw new AuthError(422, 'Аккаунт участника приглашения недоступен')
      const current = await tx.subscription.findFirst({ where: { userId: recipientId }, orderBy: { expireAt: 'desc' }, include: { plan: true } })
      if (current?.plan?.unlimitedDuration || current?.status === 'PAUSED') throw new AuthError(422, 'Для этой подписки бонус оформляется через поддержку')
      const deviceLimit = current?.deviceLimit ?? current?.plan?.deviceLimit ?? basePlan.deviceLimit
      const plan = { ...(current?.plan ?? basePlan), durationDays: days, unlimitedDuration: false,
        priceKopecks: 0, deviceLimit, maxDeviceLimit: deviceLimit, extraDevicePriceKopecks: 0 }
      const payment = await tx.payment.create({ data: {
        userId: recipientId, planId: plan.id, provider: 'LOCAL', providerStatus: 'CHANNEL_REWARD',
        status: 'SUCCEEDED', paidAt: new Date(), amountKopecks: 0, deviceLimit,
        checkoutKey: `channel:${user.telegramId}:${recipientId}`,
        planSnapshot: buildPlanPurchaseSnapshot(plan, calculatePlanPurchase(plan)) as unknown as Prisma.InputJsonValue,
        provisioningJob: { create: { status: 'PENDING', attempts: 0 } },
      } })
      payments.push(payment.id)
    }
    // Персональный промокод пригласившему: −30% на одну оплату, действует 30 дней.
    const promo = await tx.promoCode.create({ data: {
      code: `REF${randomBytes(4).toString('hex').toUpperCase()}`,
      discountPercent: campaign.referrerPromoPercent,
      audience: 'PERSONAL',
      allowedEmails: [referrer.email.toLowerCase()],
      maxUses: 1,
      maxUsesPerUser: 1,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    } })
    await tx.telegramChannelReferral.update({ where: { referredTelegramId: user.telegramId! }, data: {
      claimedAt: new Date(), referrerPaymentId: payments[0] || null, referredPaymentId: payments[1] || null,
      referrerPromoCodeId: promo.id,
    } })
    return { claimed: true, alreadyClaimed: false,
      reward: { referrerTelegramId: referrer.telegramId, promoCode: promo.code, promoPercent: campaign.referrerPromoPercent, referrerDays: campaign.referrerDays } }
  }))
  if (!locked.acquired) throw new AuthError(409, 'Начисление уже обрабатывается, повторите проверку')
  // Пригласивший узнаёт о награде сразу в боте: дни и промокод с кнопкой применения.
  const reward = 'reward' in locked.value ? locked.value.reward : null
  if (reward?.referrerTelegramId && reward.promoCode) {
    await notifyReferrerReward(Number(reward.referrerTelegramId), reward.promoCode, reward.promoPercent, reward.referrerDays)
  }
  return locked.value
}

// Уведомление пригласившему о начислении: сбой отправки не отменяет награду.
async function notifyReferrerReward(telegramId: number, promoCode: string, promoPercent: number, referrerDays: number) {
  const html = `<h3>🎁 Реферальный бонус</h3>`
    + `<p>По вашей ссылке в канал вступил новый пользователь — награда начислена.</p>`
    + `<table bordered compact><tr><td>Дни подписки</td><td>+${referrerDays}</td></tr>`
    + `<tr><td>Промокод</td><td>${escape(promoCode)} · −${promoPercent}%</td></tr><tr><td>Действует</td><td>30 дней</td></tr></table>`
    + `<tg-button-row><tg-button type="callback_data" style="success" data="avp:promo:${escape(promoCode)}">🏷 Применить ${escape(promoCode)} · −${promoPercent}%</tg-button></tg-button-row>`
    + `<tg-button-row><tg-button type="callback_data" style="primary" data="avp:bonus">🎁 Мои бонусы</tg-button></tg-button-row>`
  await miniAppBotCall('sendRichMessage', { chat_id: telegramId, rich_message: { html }, protect_content: true }).catch(() => {})
}
