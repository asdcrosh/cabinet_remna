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

// Есть ли у пользователя живое окно бота. Нужен, чтобы решить, показывать ли
// анимацию загрузки: черновик исчезает только при отправке нового сообщения,
// поэтому при правке существующего окна его запускать нельзя.
export async function hasBotScreenAnchor(chatId: number): Promise<boolean> {
  const anchor = await prisma.user.findFirst({
    where: { telegramId: BigInt(chatId), botScreenMessageId: { not: null } },
    select: { botScreenMessageId: true },
  }).catch(() => null)
  return Boolean(anchor?.botScreenMessageId)
}

// Короткая анимация «экран загружается»: временный черновик, который Telegram
// сам убирает, когда бот отправляет настоящее сообщение. Где черновики не
// поддерживаются — тихо пропускаем.
export async function sendBotScreenLoadingDraft(chatId: number) {
  await miniAppBotCall('sendRichMessageDraft', {
    chat_id: chatId, draft_id: 1,
    rich_message: { html: '<p>✨ Загружаю экран…</p>' },
  }).catch(() => {})
}

// Показ экрана в ответ на текст пользователя (меню, команды): правим
// запомненное окно, а если его ещё нет — отправляем и запоминаем.
export async function showBotScreen(chatId: number, html: string): Promise<number | null> {
  const anchor = await prisma.user.findFirst({
    where: { telegramId: BigInt(chatId), botScreenMessageId: { not: null } },
    select: { botScreenMessageId: true },
  }).catch(() => null)
  if (anchor?.botScreenMessageId) {
    const used = await displayCallbackScreen(chatId, anchor.botScreenMessageId, html)
    if (used) return used
  }
  // Reply-клавиатуру легаси-меню убираем служебным сообщением и сразу удаляем его:
  // сообщение, отправленное с ReplyKeyboardRemove, Telegram не даёт редактировать,
  // поэтому якорем единого окна может быть только «чистое» сообщение без reply_markup.
  const carrier = await miniAppBotCall<{ message_id?: number }>('sendMessage', {
    chat_id: chatId, text: '⏳ Обновляем окно…', reply_markup: { remove_keyboard: true },
  }).catch(() => null)
  if (carrier && typeof carrier.message_id === 'number') {
    await miniAppBotCall('deleteMessage', { chat_id: chatId, message_id: carrier.message_id }).catch(() => {})
  }
  const sent = await miniAppBotCall<{ message_id?: number }>('sendRichMessage', {
    chat_id: chatId, rich_message: { html }, protect_content: true,
  }).catch(() => null)
  const used = sent && typeof sent.message_id === 'number' ? sent.message_id : null
  if (used) await rememberBotScreenAnchor(chatId, used)
  return used
}
