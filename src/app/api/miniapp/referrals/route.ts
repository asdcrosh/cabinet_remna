import { requireAuth, withAuth } from '@/lib/auth/guard'
import { jsonResponse } from '@/lib/json-response'
import { prisma } from '@/lib/prisma'
import { requireMiniApp } from '@/lib/miniapp/config'
import { channelCampaign } from '@/lib/miniapp/channel-referrals'
import { ensureUserReferralCode } from '@/lib/referrals'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const GET = withAuth(async () => {
  requireMiniApp()
  const session = await requireAuth()
  if (!await isFeatureEnabled('referrals')) return jsonResponse({ error: 'Недоступно' }, { status: 404 })
  const campaign = channelCampaign()
  const code = await ensureUserReferralCode(session.uid)
  const bot = process.env.TELEGRAM_MINIAPP_BOT_USERNAME || 'alekseevVP_bot'
  if (!/^[a-zA-Z0-9_]{5,32}$/.test(bot)) throw new Error('Invalid bot username')
  const [invited, claimed, own] = await Promise.all([
    prisma.telegramChannelReferral.count({ where: { referrerId: session.uid } }),
    prisma.telegramChannelReferral.count({ where: { referrerId: session.uid, claimedAt: { not: null } } }),
    prisma.telegramChannelReferral.findUnique({ where: { referredUserId: session.uid },
      select: { eligible: true, claimedAt: true, referredPaymentId: true } }),
  ])
  return jsonResponse({ url: `https://t.me/${bot}?start=ref_${code}`, invited, claimed,
    condition: campaign ? `Пригласите нового пользователя. После вступления в канал вам ${campaign.referrerDays} дн., другу ${campaign.referredDays} дн. Лимит: ${campaign.cap} приглашений.` : 'Бонусы за вступление в канал готовятся. Условия появятся после запуска.',
    channelUrl: campaign?.channelUrl ?? null, enabled: Boolean(campaign), eligible: Boolean(own?.eligible), claimedAt: own?.claimedAt ?? null,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})
