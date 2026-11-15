import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { channelCampaign, channelGate } from './channel-referrals'
import { buildChannelGateScreen } from './rich-screens'
import { showBotScreen } from './callback-screen'

// За один проход проверяем недавно активных пользователей бота: у каждого
// свежая проверка членства — это до трёх вызовов Bot API, поэтому партия
// ограничена. За несколько проходов покрываются все активные окна.
const SWEEP_BATCH_SIZE = 25

// Периодическая проверка обязательной подписки на канал: пользователю,
// вышедшему из канала, бот сам показывает экран подписки в его окне,
// не дожидаясь следующего действия. Вызывается из watch-worker.
export async function runChannelGateSweep() {
  const campaign = channelCampaign()
  if (!campaign || !await isFeatureEnabled('referrals')) return { checked: 0, gated: 0 }
  const users = await prisma.user.findMany({
    where: { telegramId: { not: null }, botScreenMessageId: { not: null } },
    select: { telegramId: true },
    orderBy: { updatedAt: 'desc' },
    take: SWEEP_BATCH_SIZE,
  })
  let checked = 0
  let gated = 0
  for (const user of users) {
    if (user.telegramId == null) continue
    const chatId = Number(user.telegramId)
    if (!Number.isSafeInteger(chatId)) continue
    checked += 1
    const gate = await channelGate(chatId, { fresh: true }).catch(() => null)
    if (!gate) continue
    gated += 1
    await showBotScreen(chatId, buildChannelGateScreen(gate.channelUrl)).catch(() => {})
  }
  return { checked, gated }
}
