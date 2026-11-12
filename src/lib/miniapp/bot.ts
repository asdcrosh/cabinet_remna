import { createHash, timingSafeEqual } from 'node:crypto'
import { miniAppBotCall } from './bot-api'
import { miniAppUrl } from './config'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getBotScreen } from './bot-screens'
import { botScreens, type BotScreen } from './rich-screens'
import { claimChannelReward } from './channel-referrals'

const user = z.object({ id: z.number().int().positive().safe() })
export const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  callback_query: z.object({ id: z.string().max(128), from: user, data: z.string().max(64).optional(),
    message: z.object({ message_id: z.number().int().positive(), chat: z.object({ id: z.number().int().safe(), type: z.string() }) }).optional(),
  }).optional(),
  message: z.object({
    chat: z.object({ id: z.number().int().safe(), type: z.string() }),
    from: user.optional(), text: z.string().max(4096).optional(),
  }).optional(),
})

export function validWebhookSecret(received: string | null, expected = process.env.TELEGRAM_MINIAPP_WEBHOOK_SECRET) {
  if (!received || !expected || expected.length < 32 || received.length > 256) return false
  return timingSafeEqual(createHash('sha256').update(received).digest(), createHash('sha256').update(expected).digest())
}

export function isPaymentUpdate(value: unknown) {
  if (!value || typeof value !== 'object') return false
  if (Reflect.has(value, 'pre_checkout_query')) return true
  const message = Reflect.get(value, 'message')
  return Boolean(message && typeof message === 'object' && Reflect.has(message, 'successful_payment'))
}

// Old Remnashop messages remain in chats after a webhook switch. Never claim
// their callbacks as handled until every legacy action has a migration path.
export function isUnsupportedCallback(value: unknown) {
  if (!value || typeof value !== 'object' || !Reflect.has(value, 'callback_query')) return false
  const callback = Reflect.get(value, 'callback_query')
  return !callback || typeof callback !== 'object' ||
    typeof Reflect.get(callback, 'data') !== 'string' ||
    !Reflect.get(callback, 'data').startsWith('avp:')
}

// No account details or subscription URLs in messages. The signed Mini App session is the boundary.
export function welcomeMessage(section = 'home', referral?: string) {
  const url = new URL(miniAppUrl())
  url.searchParams.set('tab', section)
  if (referral && /^[A-Z0-9]{6,8}$/.test(referral)) url.searchParams.set('ref', referral)
  return {
    text: section === 'support'
      ? 'Поддержка AlekseevVP. Откройте приложение и создайте обращение. По вопросам оплаты укажите номер заказа.'
      : 'AlekseevVP\nВаш интернет. Ваши правила.\n\nПодписка, устройства и помощь в одном приложении.',
    reply_markup: { inline_keyboard: [[{ text: 'Открыть AlekseevVP', web_app: { url: url.toString() }, style: 'primary' }]] },
  }
}

export const welcomeWidgetHtml = '<html><body><div style="padding:20px;background:#101b25;color:#eef6ef;border-radius:20px"><div style="font-size:12px;color:#b5d4bc">ALEKSEEVVP</div><h2>Ваш интернет.<br>Ваши правила.</h2><p>Подписка, устройства и помощь<br>в одном приложении.</p></div></body></html>'

export async function handleMiniAppUpdate(update: z.infer<typeof telegramUpdateSchema>) {
  const callback = update.callback_query
  if (callback?.data?.startsWith('avp:')) {
    if (!callback.message || callback.message.chat.type !== 'private' || callback.message.chat.id !== callback.from.id) return
    await miniAppBotCall('answerCallbackQuery', { callback_query_id: callback.id })
    const action = callback.data.slice(4)
    let screen: BotScreen = botScreens.includes(action as BotScreen) ? action as BotScreen : 'home'
    let notice: string | undefined
    if (action === 'claim') {
      const account = await prisma.user.findUnique({ where: { telegramId: BigInt(callback.from.id) }, select: { id: true } })
      if (!account) notice = 'Сначала войдите в приложение через Telegram'
      else try {
        await claimChannelReward(account.id); screen = 'referrals'; notice = 'Бонус подтверждён и ожидает начисления'
      } catch (e) { notice = e instanceof Error ? e.message : 'Операция временно недоступна' }
    }
    if (action.startsWith('buy:')) { screen = 'plans'; notice = 'Оформление внутри Telegram недоступно' }
    const html = await getBotScreen(callback.from.id, screen, notice)
    await miniAppBotCall('editMessageText', { chat_id: callback.from.id, message_id: callback.message.message_id, rich_message: { html },
      reply_markup: { inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: miniAppUrl() } }]] } })
    return
  }
  const message = update.message
  if (!message || message.chat.type !== 'private' || !message.from || message.chat.id !== message.from.id) return
  const menu: Record<string, BotScreen> = { 'Моя подписка': 'subscription', 'Мои устройства': 'devices', 'Пригласить друга': 'referrals', 'Поддержка': 'support' }
  const menuScreen = menu[message.text || '']
  if (menuScreen && process.env.TELEGRAM_RICH_MESSAGES_ENABLED === 'true') {
    await miniAppBotCall('sendRichMessage', { chat_id: message.chat.id, rich_message: { html: await getBotScreen(message.from.id, menuScreen) }, protect_content: true })
    return
  }
  const command = message.text?.split(/\s+/)[0]?.split('@')[0]
  if (!command || !['/start', '/app', '/support', '/paysupport', '/help'].includes(command)) return
  const section = ['/support', '/paysupport', '/help'].includes(command) ? 'support' : 'home'
  const referral = message.text?.match(/^\/start(?:@[a-zA-Z0-9_]+)? ref_([A-Z0-9]{6,8})$/)?.[1]
  const content = welcomeMessage(section, referral)
  if (process.env.TELEGRAM_RICH_MESSAGES_ENABLED === 'true') {
    await miniAppBotCall('sendRichMessage', { chat_id: message.chat.id,
      rich_message: { html: await getBotScreen(message.from.id, section as BotScreen, undefined, referral) },
      protect_content: true, reply_markup: { keyboard: [[{ text: 'Моя подписка' }, { text: 'Мои устройства' }], [{ text: 'Пригласить друга' }, { text: 'Поддержка' }]], resize_keyboard: true, is_persistent: true }  })
    return
  }
  if (process.env.TELEGRAM_WIDGETS_ENABLED === 'true' && command === '/start') {
    try {
      await miniAppBotCall('sendWidget', { chat_id: message.chat.id, html: welcomeWidgetHtml,
        caption: content.text, reply_markup: content.reply_markup, allow_queries: false })
      return
    } catch { /* Older Bot API installations retain a usable standard message. */ }
  }
  await miniAppBotCall('sendMessage', { chat_id: message.chat.id, ...content })
}
