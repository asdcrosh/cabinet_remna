import { getBrandName } from '@/lib/branding'
import { prisma } from '@/lib/prisma'
import { getMiniAppOverview } from './overview'
import { buildAdminTicketsScreen, buildBroadcastThemesScreen, buildRichScreen, buildRichPaymentScreen, buildSupportThreadScreen, type BotScreen, type BotThreadMessage, type RichScreenInput } from './rich-screens'
import { broadcastThemes, broadcastThemeView } from './broadcast-bot'
import { miniAppBannerUrl, miniAppUrl } from './config'
import { botSupportAttachmentUrl } from './attachment-sign'
import { channelCampaign } from './channel-referrals'
import { ensureUserReferralCode } from '@/lib/referrals'
import { syncLocalDevicesFromRemnawave } from '@/lib/remnawave-device-sync'
import { hasRemnawaveUserReference, remnawave, remnawaveUserReference } from '@/lib/remnawave'
import { createBotCheckoutGrant, telegramRubleMethods } from './ruble-payments'
import { isYookassaConfigured } from '@/lib/yookassa'
import { getFeatureFlags } from '@/lib/feature-flags'

const paymentStatusLabel: Record<string, string> = { SUCCEEDED: 'Оплачен', PENDING: 'Ожидает оплаты', CANCELED: 'Отменён', REFUNDED: 'Возврат' }
const autoRenewalLabel: Record<string, string> = {
  AWAITING_PAYMENT_METHOD: 'ждёт привязки карты', ACTIVE: 'включено', PROCESSING: 'списание в обработке',
  RETRYING: 'повторная попытка списания', PAUSED: 'на паузе', DISABLED: 'отключено',
}
const ticketStatusLabel = (status: string) => status === 'WAITING_USER' ? 'Есть ответ' : status === 'CLOSED' ? 'Закрыто' : 'Ждём ответа поддержки'
const formatRub = (kopecks: number) => `${(kopecks / 100).toLocaleString('ru-RU')} ₽`
const formatDate = (date: Date) => date.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })

export async function getBotScreenInput(telegramId: number, screen: BotScreen, notice?: string, referralCode?: string): Promise<RichScreenInput> {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } })
  const appUrl = new URL(miniAppUrl())
  if (referralCode) appUrl.searchParams.set('ref', referralCode)
  const input: RichScreenInput = { screen, appUrl: appUrl.toString(), overview: user ? await getMiniAppOverview(user.id) : null,
    bannerUrl: miniAppBannerUrl(), brandName: getBrandName(), notice,
    admin: Boolean(user && user.role !== 'USER') }
  if (user && input.overview) {
    if (screen === 'devices' && hasRemnawaveUserReference(user)) {
      try {
        await syncLocalDevicesFromRemnawave({ localUserId: user.id, reference: remnawaveUserReference(user) })
      } catch { input.notice = 'Не удалось обновить список устройств. Показаны сохранённые данные.' }
      const devices = await prisma.device.findMany({ where: { userId: user.id }, orderBy: { lastSeenAt: 'desc' }, take: 8,
        select: { id: true, displayName: true, platform: true, lastSeenAt: true } })
      // Без имени устройство подписываем платформой и датой — на кнопке сразу видно, что это.
      input.devices = devices.map(device => ({
        id: device.id,
        title: device.displayName || `${device.platform || 'Устройство'} · ${formatDate(device.lastSeenAt)}`,
        platform: device.platform || 'VPN-клиент',
      }))
    }
    if (screen === 'connect' && user.remnawaveUsername) {
      try {
        const info = await remnawave.getSubscriptionByUsername(user.remnawaveUsername)
        const url = info.response.subscriptionUrl
        if (typeof url === 'string' && /^https:\/\//.test(url)) input.connectUrl = url
      } catch { input.connectUrl = null }
    }
    if (screen === 'referrals' && input.overview.referrals) {
      const campaign = channelCampaign()
      const code = await ensureUserReferralCode(user.id)
      const [invited, claimed, own] = await Promise.all([
        prisma.telegramChannelReferral.count({ where: { referrerId: user.id } }),
        prisma.telegramChannelReferral.count({ where: { referrerId: user.id, claimedAt: { not: null } } }),
        prisma.telegramChannelReferral.findUnique({ where: { referredUserId: user.id } }),
      ])
      if (campaign) input.referral = { url: `https://t.me/${process.env.TELEGRAM_MINIAPP_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || ''}?start=ref_${code}`,
        condition: `Пригласите нового пользователя до его вступления в канал: вам ${campaign.referrerDays} дн. и промокод −${campaign.referrerPromoPercent}%, другу ${campaign.referredDays} дн. Дни добавляются к активной подписке — для участия она нужна вам обоим. Лимит: ${campaign.cap} бонусов.`,
        invited, claimed, channelUrl: campaign.channelUrl, eligible: Boolean(own?.eligible), ownClaimed: Boolean(own?.claimedAt) }
    }
    if (screen === 'billing') {
      const [payments, autoRenewal] = await Promise.all([
        prisma.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5,
          select: { amountKopecks: true, status: true, createdAt: true, plan: { select: { name: true } } } }),
        prisma.autoRenewal.findUnique({ where: { userId: user.id }, select: { status: true, paymentMethodTitle: true } }),
      ])
      input.payments = payments.map(payment => ({ title: payment.plan.name, amount: formatRub(payment.amountKopecks),
        status: paymentStatusLabel[payment.status] ?? payment.status, date: formatDate(payment.createdAt) }))
      input.autoRenewal = autoRenewal
        ? `${autoRenewalLabel[autoRenewal.status] ?? autoRenewal.status.toLowerCase()}${autoRenewal.status === 'ACTIVE' && autoRenewal.paymentMethodTitle ? ` · ${autoRenewal.paymentMethodTitle}` : ''}`
        : null
      input.autoRenewalActive = autoRenewal?.status === 'ACTIVE' || autoRenewal?.status === 'PROCESSING' || autoRenewal?.status === 'RETRYING' || autoRenewal?.status === 'PAUSED'
    }
    if (screen === 'bonus' || screen === 'promos') {
      const features = await getFeatureFlags()
      const attempts = features.bonusBox
        ? await prisma.bonusBoxAttempt.count({ where: { userId: user.id, usedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })
        : 0
      input.bonus = { enabled: features.bonusBox, attempts }
      input.promoCodes = await getBotPromoCodes(user.id)
    }
    if (screen === 'notifications') {
      const [unread, items] = await Promise.all([
        prisma.userNotification.count({ where: { userId: user.id, readAt: null } }),
        prisma.userNotification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5,
          select: { title: true, createdAt: true, readAt: true } }),
      ])
      input.inbox = { unread, items: items.map(item => ({ title: item.title, date: formatDate(item.createdAt), fresh: !item.readAt })) }
    }
    if (screen === 'settings') {
      const prefs = await prisma.userNotificationPreference.findUnique({ where: { userId: user.id } })
      input.prefs = { telegram: prefs?.telegramEnabled ?? true, email: prefs?.emailEnabled ?? true, broadcasts: prefs?.broadcastsEnabled ?? true }
    }
    if (screen === 'admin' && input.admin) {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const [users, activeSubscriptions, paymentsToday, openTickets] = await Promise.all([
        prisma.user.count(),
        prisma.subscription.count({ where: { status: 'ACTIVE', expireAt: { gt: new Date() } } }),
        prisma.payment.count({ where: { status: 'SUCCEEDED', paidAt: { gte: todayStart } } }),
        prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'WAITING_ADMIN'] } } }),
      ])
      input.adminStats = { users, activeSubscriptions, paymentsToday, openTickets }
    }
    if (screen === 'support' && input.overview.support) {
      const tickets = await prisma.supportTicket.findMany({ where: { userId: user.id, status: { not: 'CLOSED' } }, orderBy: { lastMessageAt: 'desc' }, take: 5,
        select: { id: true, subject: true, status: true } })
      input.tickets = tickets.map(ticket => ({ id: ticket.id, subject: ticket.subject, status: ticketStatusLabel(ticket.status) }))
    }
    if ((screen === 'referrals' && !input.overview.referrals) || (screen === 'support' && !input.overview.support) || (screen === 'admin' && !input.admin)) {
      input.screen = 'home'; input.notice = 'Раздел сейчас недоступен'
    }
  }
  return input
}

// Промокоды, выданные пользователю и ещё не использованные им.
// Источники: колесо, приветственный бонус, объединение кодов и персональные
// коды (реферальные награды и выдача из кабинета) — они привязаны по email.
export async function getBotPromoCodes(userId: string) {
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  const [openings, welcomes, merges, personal] = await Promise.all([
    prisma.bonusBoxOpening.findMany({ where: { userId, promoCodeId: { not: null } },
      select: { promoCode: { select: { code: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.welcomeBonusRedemption.findMany({ where: { userId, promoCodeId: { not: null } },
      select: { promoCode: { select: { code: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.promoCodeMerge.findMany({ where: { userId },
      select: { resultPromo: { select: { code: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    account ? prisma.promoCode.findMany({ where: { audience: 'PERSONAL', allowedEmails: { has: account.email.toLowerCase() } },
      select: { code: true }, orderBy: { createdAt: 'desc' }, take: 20 }) : Promise.resolve([]),
  ])
  const codes = [...new Set([...merges.map(item => item.resultPromo.code), ...personal.map(item => item.code),
    ...openings.map(item => item.promoCode?.code), ...welcomes.map(item => item.promoCode?.code)]
    .filter((code): code is string => Boolean(code)))]
  if (!codes.length) return []
  const [active, redeemed] = await Promise.all([
    prisma.promoCode.findMany({ where: { code: { in: codes }, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { code: true, discountPercent: true, expiresAt: true } }),
    prisma.promoCodeRedemption.findMany({ where: { userId, promoCode: { code: { in: codes } } }, select: { promoCode: { select: { code: true } } } }),
  ])
  const used = new Set(redeemed.map(item => item.promoCode.code))
  return active.filter(promo => !used.has(promo.code)).slice(0, 20)
    .map(promo => ({ code: promo.code, discountPercent: promo.discountPercent, expiresAt: promo.expiresAt?.toISOString() ?? null }))
}

export async function getBotScreen(telegramId: number, screen: BotScreen, notice?: string, referralCode?: string) {
  return buildRichScreen(await getBotScreenInput(telegramId, screen, notice, referralCode))
}

export async function getBotPaymentScreen(telegramId: number, planId: string, promo?: { code: string; discountPercent: number } | null) {
  const hasBotRublePayments = telegramRubleMethods('bot').length > 0
  const [input, account, yookassaAvailable] = await Promise.all([
    getBotScreenInput(telegramId, 'plans'),
    hasBotRublePayments ? prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) }, select: { id: true } }) : null,
    hasBotRublePayments ? isYookassaConfigured() : false,
  ])
  const grant = account && yookassaAvailable ? createBotCheckoutGrant(account.id, planId) : null
  return buildRichPaymentScreen(input, planId, grant, promo ?? null)
}

// Проверяет, что промокод доступен именно этому пользователю (выдан ему и не использован).
// Коды нечувствительны к регистру — в системе хранятся как есть, сравниваем в верхнем регистре.
export async function validateBotPromoCode(telegramId: number, code: string) {
  const account = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) }, select: { id: true } })
  if (!account) return null
  const wanted = code.trim().toUpperCase()
  const promos = await getBotPromoCodes(account.id)
  const promo = promos.find(item => item.code.toUpperCase() === wanted)
  return promo ? { code: promo.code, discountPercent: promo.discountPercent } : null
}

// Экран тарифов с применённым промокодом: цены со скидкой, оплата передаёт код дальше.
export async function getBotPlansPromoScreen(telegramId: number, code: string) {
  const promo = await validateBotPromoCode(telegramId, code)
  if (!promo) return getBotScreen(telegramId, 'bonus', 'Промокод недоступен — возможно, он уже использован или истёк')
  const input = await getBotScreenInput(telegramId, 'plans')
  input.activePromo = promo
  return buildRichScreen(input)
}

// Переписка по обращению для экрана бота. Помечает тикет прочитанным пользователю.
export async function getBotSupportThreadScreen(telegramId: number, ticketId: string, notice?: string) {
  const input = await getBotScreenInput(telegramId, 'support', notice)
  const account = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) }, select: { id: true } })
  const ticket = account ? await prisma.supportTicket.findFirst({
    where: { id: ticketId, userId: account.id },
    select: { id: true, subject: true, status: true, updatedAt: true, satisfactionRating: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 6,
        select: { body: true, senderRole: true, createdAt: true,
          attachments: { select: { id: true, fileName: true, mimeType: true } } } } },
  }) : null
  if (!ticket) return getBotScreen(telegramId, 'support', 'Обращение не найдено')
  if (ticket.status !== 'CLOSED') {
    await prisma.supportTicket.updateMany({ where: { id: ticket.id, userUnreadCount: { gt: 0 } }, data: { userUnreadCount: 0 } })
  }
  const messages: BotThreadMessage[] = ticket.messages.reverse().map(message => ({
    from: message.senderRole === 'USER' ? 'user' : 'admin',
    body: message.body.length > 500 ? `${message.body.slice(0, 500)}…` : message.body,
    date: formatDate(message.createdAt),
    attachments: message.attachments.map(file => ({
      fileName: file.fileName,
      imageUrl: file.mimeType.startsWith('image/') ? botSupportAttachmentUrl(file.id) : null,
    })),
  }))
  return buildSupportThreadScreen(input, { id: ticket.id, subject: ticket.subject, status: ticketStatusLabel(ticket.status),
    rating: ticket.satisfactionRating == null ? null : ticket.satisfactionRating >= 5 ? 'up' : 'down', messages })
}


const adminTicketStatusLabel = (status: string) =>
  status === 'WAITING_ADMIN' || status === 'OPEN' ? 'Ждёт ответа' : status === 'WAITING_USER' ? 'Отвечено' : 'Закрыто'
const adminUserLabel = (user: { name: string | null; telegramUsername: string | null; email: string }) =>
  user.name?.split(' ')[0] || (user.telegramUsername ? `@${user.telegramUsername}` : user.email)

// Очередь обращений для администратора.
export async function getBotAdminTicketsScreen(telegramId: number, notice?: string) {
  const account = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) }, select: { id: true, role: true } })
  if (!account || account.role === 'USER') return getBotScreen(telegramId, 'home', 'Раздел доступен администраторам')
  const input = await getBotScreenInput(telegramId, 'admin', notice)
  const tickets = await prisma.supportTicket.findMany({
    where: { status: { not: 'CLOSED' } },
    orderBy: [{ adminUnreadCount: 'desc' }, { lastMessageAt: 'desc' }],
    take: 8,
    select: {
      id: true, subject: true, status: true, lastMessageAt: true, adminUnreadCount: true,
      user: { select: { name: true, telegramUsername: true, email: true } },
    },
  })
  return buildAdminTicketsScreen(input, tickets.map(ticket => ({
    id: ticket.id,
    subject: ticket.subject,
    status: adminTicketStatusLabel(ticket.status),
    userLabel: adminUserLabel(ticket.user),
    date: formatDate(ticket.lastMessageAt),
    fresh: ticket.adminUnreadCount > 0,
  })))
}

// Выбор темы рассылки для администратора.
export async function getBotBroadcastThemesScreen(telegramId: number, notice?: string) {
  const account = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) }, select: { id: true, role: true } })
  if (!account || account.role === 'USER') return getBotScreen(telegramId, 'home', 'Раздел доступен администраторам')
  const input = await getBotScreenInput(telegramId, 'admin', notice)
  return buildBroadcastThemesScreen(input, broadcastThemes.map(broadcastThemeView))
}

// Переписка обращения глазами администратора. Помечает тикет прочитанным админом.
export async function getBotAdminThreadScreen(telegramId: number, ticketId: string, notice?: string) {
  const account = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) }, select: { id: true, role: true } })
  if (!account || account.role === 'USER') return getBotScreen(telegramId, 'home', 'Раздел доступен администраторам')
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      id: true, subject: true, status: true, satisfactionRating: true,
      user: { select: { name: true, telegramUsername: true, email: true } },
      assignee: { select: { name: true, telegramUsername: true, email: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 6,
        select: { body: true, senderRole: true, createdAt: true,
          attachments: { select: { id: true, fileName: true, mimeType: true } } } },
    },
  })
  if (!ticket) return getBotAdminTicketsScreen(telegramId, 'Обращение не найдено')
  await prisma.supportTicket.updateMany({ where: { id: ticket.id, adminUnreadCount: { gt: 0 } }, data: { adminUnreadCount: 0 } })
  const input = await getBotScreenInput(telegramId, 'admin', notice)
  const messages: BotThreadMessage[] = ticket.messages.reverse().map(message => ({
    from: message.senderRole === 'USER' ? 'user' : 'admin',
    body: message.body.length > 500 ? `${message.body.slice(0, 500)}…` : message.body,
    date: formatDate(message.createdAt),
    attachments: message.attachments.map(file => ({
      fileName: file.fileName,
      imageUrl: file.mimeType.startsWith('image/') ? botSupportAttachmentUrl(file.id) : null,
    })),
  }))
  return buildSupportThreadScreen(input, {
    id: ticket.id,
    subject: ticket.subject,
    status: adminTicketStatusLabel(ticket.status),
    userLabel: adminUserLabel(ticket.user),
    assigneeLabel: ticket.assignee ? adminUserLabel(ticket.assignee) : null,
    rating: ticket.satisfactionRating == null ? null : ticket.satisfactionRating >= 5 ? 'up' : 'down',
    messages,
  }, { viewer: 'admin' })
}
