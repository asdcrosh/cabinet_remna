import { escapeTelegramHtml as escape } from '@/lib/telegram-format'
import { miniAppBotCall } from './bot-api'
import { miniAppEnabled } from './config'

// Рассылка с кнопкой в раздел бота: обычный pipeline умеет только url-кнопки,
// поэтому такие кампании уходят rich-сообщением с callback_data. Текст приходит
// уже отрендеренным (renderTelegramCustomEmoji), переносы строк заменяем на <br>.
export async function sendBroadcastBotMessage(telegramId: number, input: {
  text: string
  imageUrl?: string
  button: { label: string; data: string }
}) {
  if (!miniAppEnabled()) return false
  const html = [
    ...(input.imageUrl && /^https:\/\//.test(input.imageUrl) ? [`<img src="${escape(input.imageUrl)}">`] : []),
    `<p>${input.text.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>')}</p>`,
    `<tg-button-row><tg-button type="callback_data" style="success" data="${escape(input.button.data)}">${escape(input.button.label)}</tg-button></tg-button-row>`,
  ].join('')
  try {
    await miniAppBotCall('sendRichMessage', { chat_id: telegramId, rich_message: { html }, protect_content: true })
    return true
  } catch {
    return false
  }
}
