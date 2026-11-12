import { prisma } from '@/lib/prisma'
import { getMiniAppOverview } from './overview'
import { buildRichScreen, type BotScreen, type RichScreenInput } from './rich-screens'
import { miniAppUrl } from './config'
import { channelCampaign } from './channel-referrals'
import { ensureUserReferralCode } from '@/lib/referrals'
import { syncLocalDevicesFromRemnawave } from '@/lib/remnawave-device-sync'
import { hasRemnawaveUserReference, remnawaveUserReference } from '@/lib/remnawave'

export async function getBotScreenInput(telegramId: number, screen: BotScreen, notice?: string, referralCode?: string): Promise<RichScreenInput> {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } })
  const appUrl = new URL(miniAppUrl())
  if (referralCode) appUrl.searchParams.set('ref', referralCode)
  const input: RichScreenInput = { screen, appUrl: appUrl.toString(), overview: user ? await getMiniAppOverview(user.id) : null,
    bannerUrl: process.env.TELEGRAM_MINIAPP_BANNER_URL || new URL('/miniapp/banner.png', appUrl).toString(), notice }
  if (user && input.overview) {
    if (screen === 'devices' && hasRemnawaveUserReference(user)) {
      try {
        const result = await syncLocalDevicesFromRemnawave({ localUserId: user.id, reference: remnawaveUserReference(user) })
        input.devices = result.devices.slice(0, 12).map(device => ({ title: device.displayName || device.deviceModel || 'Устройство', platform: device.platform || 'VPN-клиент' }))
      } catch { input.notice = 'Не удалось обновить список устройств. Попробуйте позже.' }
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
    if (screen === 'support' && input.overview.support) {
      const tickets = await prisma.supportTicket.findMany({ where: { userId: user.id, status: { not: 'CLOSED' } }, orderBy: { lastMessageAt: 'desc' }, take: 5,
        select: { subject: true, status: true } })
      input.tickets = tickets.map(ticket => ({ subject: ticket.subject, status: ticket.status === 'WAITING_USER' ? 'Есть ответ' : 'Ждём ответа поддержки' }))
    }
    if ((screen === 'referrals' && !input.overview.referrals) || (screen === 'support' && !input.overview.support)) {
      input.screen = 'home'; input.notice = 'Раздел сейчас недоступен'
    }
  }
  return input
}

export async function getBotScreen(telegramId: number, screen: BotScreen, notice?: string, referralCode?: string) {
  return buildRichScreen(await getBotScreenInput(telegramId, screen, notice, referralCode))
}
