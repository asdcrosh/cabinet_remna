import { escapeTelegramHtml as escape } from '@/lib/telegram-format'
import { miniAppBotCall } from './bot-api'
import { miniAppEnabled } from './config'
import { refreshUserThreadView } from './support-sync'

// Ответ поддержки приходит в бот сразу с текстом: пользователю не нужно
// открывать кабинет — ответить можно одной кнопкой прямо в чате.
// Если тред уже открыт в боте, он обновляется на месте — без нового сообщения.
export async function sendSupportReplyBotMessage(telegramId: number, input: { ticketId: string; subject: string; excerpt: string }) {
  if (!miniAppEnabled()) return false
  try {
    if (await refreshUserThreadView(input.ticketId)) return true
  } catch { /* Если окно не обновилось, отправляем карточку как раньше. */ }
  const html = [
    '<h3>🛟 Ответ поддержки</h3>',
    `<h4>${escape(input.subject)}</h4>`,
    `<p>${escape(input.excerpt)}</p>`,
    `<tg-button-row><tg-button type="callback_data" style="success" data="avp:supr:${escape(input.ticketId)}">✍️ Ответить</tg-button></tg-button-row>`,
    `<tg-button-row><tg-button type="callback_data" style="primary" data="avp:supt:${escape(input.ticketId)}">💬 Открыть диалог</tg-button></tg-button-row>`,
  ].join('')
  try {
    await miniAppBotCall('sendRichMessage', { chat_id: telegramId, rich_message: { html }, protect_content: true })
    return true
  } catch {
    return false
  }
}
