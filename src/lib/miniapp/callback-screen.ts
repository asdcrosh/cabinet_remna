import { miniAppBotCall } from './bot-api'

// Экраны бота самодостаточны: все действия выполняются кнопками внутри
// rich-сообщения, поэтому принудительная кнопка «Открыть приложение» не нужна.
// appUrl оставлен в сигнатуре для совместимости вызовов.
// Возвращает id сообщения, в котором теперь живёт экран: при отказе Telegram
// редактировать экран уходит новым сообщением, и якорь надо обновить.
export async function displayCallbackScreen(chatId: number, messageId: number, html: string, _appUrl?: string): Promise<number | null> {
  try {
    await miniAppBotCall('editMessageText', { chat_id: chatId, message_id: messageId, rich_message: { html } })
    return messageId
  } catch (error) {
    // Правка без изменений — не ошибка: экран уже показывает нужное.
    if (error instanceof Error && /not modified/i.test(error.message)) return messageId
    // Telegram cannot edit a rich message sent with ReplyKeyboardRemove.
    // The new card has no reply keyboard, so subsequent navigation can edit it.
    const sent = await miniAppBotCall<{ message_id?: number }>('sendRichMessage', { chat_id: chatId, rich_message: { html }, protect_content: true })
    return typeof sent?.message_id === 'number' ? sent.message_id : null
  }
}
