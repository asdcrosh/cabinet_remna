import { prisma } from '@/lib/prisma'
import { getMiniAppOverview } from './overview'
import { buildRichScreen, buildRichPaymentScreen, type BotScreen, type RichScreenInput } from './rich-screens'
import { miniAppUrl } from './config'
import { channelCampaign } from './channel-referrals'
import { ensureUserReferralCode } from '@/lib/referrals'
import { syncLocalDevicesFromRemnawave } from '@/lib/remnawave-device-sync'
import { hasRemnawaveUserReference, remnawaveUserReference } from '@/lib/remnawave'
import { isYookassaConfigured } from '@/lib/yookassa'
import { getFeatureFlags } from '@/lib/feature-flags'

const paymentStatusLabel: Record<string, string> = { SUCCEEDED: 'Оплачен', PENDING: 'Ожидает оплаты', CANCELED: 'Отменён', REFUNDED: 'Возврат' }
const autoRenewalLabel: Record<string, string> = {
  AWAITING_PAYMENT_METHOD: 'ждёт привязки карты', ACTIVE: 'включено', PROCESSING: 'списание в обработке',
  RETRYING: 'повторная попытка списания', PAUSED: 'на паузе', DISABLED: 'отключено',
}
const formatRub = (kopecks: number) => `${(kopecks / 100).toLocaleString('ru-RU')} ₽`
const formatDate = (date: Date) => date.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })

export async function getBotScreenInput(telegramId: number, screen: BotScreen, notice?: string, referralCode?: string): Promise<RichScreenInput> {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } })
  const appUrl = new URL(miniAppUrl())
  if (referralCode) appUrl.searchParams.set('ref', referralCode)
  const input: RichScreenInput = { screen, appUrl: appUrl.toString(), overview: user ? await getMiniAppOverview(user.id) : null,
    bannerUrl: process.env.TELEGRAM_MINIAPP_BANNER_URL || new URL('/miniapp/banner.png?v=2', appUrl).toString(), notice,
    admin: Boolean(user && user.role !== 'USER') }
  if (user && input.overview) {
    if (screen === 'devices' && hasRemnawaveUserReference(user)) {
      try {
        await syncLocalDevicesFromRemnawave({ localUserId: user.id, reference: remnawaveUserReference(user) })
      } catch { input.notice = 'Не удалось обновить список устройств. Показаны сохранённые данные.' }
      const devices = await prisma.device.findMany({ where: { userId: user.id }, orderBy: { lastSeenAt: 'desc' }, take: 8,
        select: { id: true, displayName: true, platform: true } })
      input.devices = devices.map(device => ({ id: device.id, title: device.displayName || 'Устройство', platform: device.platform || 'VPN-клиент' }))
    }
    if (screen === 'referrals' && input.overview.referrals) {
      const campaign = channelCampaign()
      const code = await ensureUserReferralCode(user.id)
      const [invited, claimed, own] = await Promise.all([
        prisma.telegramChannelReferral.count({ where: { referrerId: user.id } }),
        prisma.telegramChannelReferral.count({ where: { referrerId: user.id, claimedAt: { not: null } } }),
        prisma.telegramChannelReferral.findUnique({ where: { referredUserId: user.id } }),
      ])
      if (campaign) input.referral = { url: `https://t.me/${process.env.TELEGRAM_MINIAPP_BOT_USERNAME || 'alekseevVP_bot'}?start=ref_${code}`,
        condition: `Пригласите нового пользователя до его вступления в канал: вам ${campaign.referrerDays} дн., другу ${campaign.referredDays} дн. Лимит: ${campaign.cap} бонусов.`,
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
    }
    if (screen === 'bonus') {
      const features = await getFeatureFlags()
      const attempts = features.bonusBox
        ? await prisma.bonusBoxAttempt.count({ where: { userId: user.id, usedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })
        : 0
      input.bonus = { enabled: features.bonusBox, attempts }
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
        select: { subject: true, status: true } })
      input.tickets = tickets.map(ticket => ({ subject: ticket.subject, status: ticket.status === 'WAITING_USER' ? 'Есть ответ' : 'Ждём ответа поддержки' }))
    }
    if ((screen === 'referrals' && !input.overview.referrals) || (screen === 'support' && !input.overview.support) || (screen === 'admin' && !input.admin)) {
      input.screen = 'home'; input.notice = 'Раздел сейчас недоступен'
    }
  }
  return input
}

export async function getBotScreen(telegramId: number, screen: BotScreen, notice?: string, referralCode?: string) {
  return buildRichScreen(await getBotScreenInput(telegramId, screen, notice, referralCode))
}

export async function getBotPaymentScreen(telegramId: number, planId: string) {
  const [input, yookassaAvailable] = await Promise.all([
    getBotScreenInput(telegramId, 'plans'), isYookassaConfigured(),
  ])
  return buildRichPaymentScreen(input, planId, yookassaAvailable)
}
