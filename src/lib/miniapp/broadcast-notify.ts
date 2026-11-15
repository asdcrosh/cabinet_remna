import { escapeTelegramHtml as escape } from '@/lib/telegram-format'
import { miniAppBotCall } from './bot-api'
import { miniAppEnabled } from './config'

// Рассылка с кнопкой в раздел бота: обычный pipeline умеет только url-кнопки,
// поэтому такие кампании уходят через миниапп-бота с callback_data. Без фото —
// rich-сообщением, с фото — sendPhoto: rich-разметка не принимает file_id.
// Текст приходит уже отрендеренным (renderTelegramCustomEmoji).
export async function sendBroadcastBotMessage(telegramId: number, input: {
  text: string
  imageUrl?: string
  imageFileId?: string
  button: { label: string; data: string }
}) {
  if (!miniAppEnabled()) return false
  try {
    if (input.imageFileId) {
      await miniAppBotCall('sendPhoto', {
        chat_id: telegramId,
        photo: input.imageFileId,
        caption: input.text.slice(0, 1000),
        parse_mode: 'HTML',
        protect_content: true,
        reply_markup: {
          inline_keyboard: [[
            { text: input.button.label, callback_data: input.button.data, style: 'success' },
          ]],
        },
      })
      return true
    }
    const html = [
      ...(input.imageUrl && /^https:\/\//.test(input.imageUrl) ? [`<img src="${escape(input.imageUrl)}">`] : []),
      `<p>${input.text.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>')}</p>`,
      `<tg-button-row><tg-button type="callback_data" style="success" data="${escape(input.button.data)}">${escape(input.button.label)}</tg-button></tg-button-row>`,
    ].join('')
    await miniAppBotCall('sendRichMessage', { chat_id: telegramId, rich_message: { html }, protect_content: true })
    return true
  } catch {
    return false
  }
}
