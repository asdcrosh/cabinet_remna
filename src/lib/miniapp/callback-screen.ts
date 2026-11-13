import { miniAppBotCall } from './bot-api'

export async function displayCallbackScreen(chatId: number, messageId: number, html: string, appUrl: string) {
  try {
    await miniAppBotCall('editMessageText', { chat_id: chatId, message_id: messageId,
      rich_message: { html }, reply_markup: { inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: appUrl } }]] } })
  } catch {
    // Telegram cannot edit a rich message sent with ReplyKeyboardRemove.
    // The new card has no reply keyboard, so subsequent navigation can edit it.
    await miniAppBotCall('sendRichMessage', { chat_id: chatId, rich_message: { html }, protect_content: true })
  }
}
