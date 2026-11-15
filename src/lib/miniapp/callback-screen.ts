import { miniAppBotCall } from './bot-api'

// Экраны бота самодостаточны: все действия выполняются кнопками внутри
// rich-сообщения, поэтому принудительная кнопка «Открыть приложение» не нужна.
// appUrl оставлен в сигнатуре для совместимости вызовов.
export async function displayCallbackScreen(chatId: number, messageId: number, html: string, _appUrl?: string) {
  try {
    await miniAppBotCall('editMessageText', { chat_id: chatId, message_id: messageId, rich_message: { html } })
  } catch {
    // Telegram cannot edit a rich message sent with ReplyKeyboardRemove.
    // The new card has no reply keyboard, so subsequent navigation can edit it.
    await miniAppBotCall('sendRichMessage', { chat_id: chatId, rich_message: { html }, protect_content: true })
  }
}
