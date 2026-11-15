import { miniAppBotCall } from './bot-api'
import { prisma } from '@/lib/prisma'

// Экраны бота самодостаточны: все действия выполняются кнопками внутри
// rich-сообщения, поэтому принудительная кнопка «Открыть приложение» не нужна.
// appUrl оставлен в сигнатуре для совместимости вызовов.
// Возвращает id сообщения, в котором теперь живёт экран: при отказе Telegram
// редактировать экран уходит новым сообщением, и якорь надо обновить.
export async function displayCallbackScreen(chatId: number, messageId: number, html: string, _appUrl?: string): Promise<number | null> {
  try {
    await miniAppBotCall('editMessageText', { chat_id: chatId, message_id: messageId, rich_message: { html } })
    await rememberBotScreenAnchor(chatId, messageId)
    return messageId
  } catch (error) {
    // Правка без изменений — не ошибка: экран уже показывает нужное.
    if (error instanceof Error && /not modified/i.test(error.message)) {
      await rememberBotScreenAnchor(chatId, messageId)
      return messageId
    }
    // Telegram cannot edit a rich message sent with ReplyKeyboardRemove.
    // The new card has no reply keyboard, so subsequent navigation can edit it.
    const sent = await miniAppBotCall<{ message_id?: number }>('sendRichMessage', { chat_id: chatId, rich_message: { html }, protect_content: true })
    const used = typeof sent?.message_id === 'number' ? sent.message_id : null
    if (used) await rememberBotScreenAnchor(chatId, used)
    return used
  }
}

// Единое окно бота: запоминаем последнее экранное сообщение пользователя,
// чтобы навигация текстовыми кнопками и командами правила его на месте.
async function rememberBotScreenAnchor(chatId: number, messageId: number) {
  await prisma.user.updateMany({ where: { telegramId: BigInt(chatId) }, data: { botScreenMessageId: messageId } })
    // Колонки нет до применения миграции — логируем, иначе окно молча шлёт новые сообщения.
    .catch(error => console.warn('[miniapp] bot screen anchor not saved (миграции применены?):',
      error instanceof Error ? error.message : error))
}

// Показ экрана в ответ на текст пользователя (меню, команды): правим
// запомненное окно, а если его ещё нет — отправляем и запоминаем.
// nearMessageId — id сообщения пользователя, на которое отвечаем: если окно
// уехало далеко вверх по истории (уведомления, старые экраны), править его
// бессмысленно — пользователь не увидит. Устаревшее окно удаляем, экран
// показываем свежим сообщением внизу чата.
export async function showBotScreen(chatId: number, html: string, nearMessageId?: number): Promise<number | null> {
  const anchor = await prisma.user.findFirst({
    where: { telegramId: BigInt(chatId), botScreenMessageId: { not: null } },
    select: { botScreenMessageId: true },
  }).catch(() => null)
  const anchorId = anchor?.botScreenMessageId ?? null
  const stale = anchorId != null && nearMessageId != null && anchorId < nearMessageId - 3
  if (anchorId != null && !stale) {
    const used = await displayCallbackScreen(chatId, anchorId, html)
    if (used) return used
  }
  if (stale && anchorId != null) {
    await miniAppBotCall('deleteMessage', { chat_id: chatId, message_id: anchorId }).catch(() => {})
  }
  // Reply-клавиатуру легаси-меню убираем служебным сообщением и сразу удаляем его:
  // сообщение, отправленное с ReplyKeyboardRemove, Telegram не даёт редактировать,
  // поэтому якорем единого окна может быть только «чистое» сообщение без reply_markup.
  const carrier = await miniAppBotCall<{ message_id?: number }>('sendMessage', {
    chat_id: chatId, text: '⏳ Обновляем окно…', reply_markup: { remove_keyboard: true },
  }).catch(error => { console.warn('[miniapp] bot keyboard carrier failed:', error instanceof Error ? error.message : error); return null })
  if (carrier && typeof carrier.message_id === 'number') {
    await miniAppBotCall('deleteMessage', { chat_id: chatId, message_id: carrier.message_id }).catch(() => {})
  }
  const sent = await miniAppBotCall<{ message_id?: number }>('sendRichMessage', {
    chat_id: chatId, rich_message: { html }, protect_content: true,
    // Ошибка отправки логируется: без неё экран молча не появляется.
  }).catch(error => { console.warn('[miniapp] bot screen send failed:', error instanceof Error ? error.message : error); return null })
  const used = sent && typeof sent.message_id === 'number' ? sent.message_id : null
  if (used) await rememberBotScreenAnchor(chatId, used)
  return used
}
