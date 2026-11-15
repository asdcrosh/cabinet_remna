import { prisma } from '@/lib/prisma'

// Состояния диалога бота:
//   support:new:<category>      — ждём текст нового обращения
//   support:reply:<ticketId>    — ждём сообщение в существующий тикет
//   admin:reply:<ticketId>      — ждём ответ администратора в тикет
//   broadcast:text:<theme>      — ждём текст рассылки
//   broadcast:preview:<theme>   — текст сохранён в payload, ждём подтверждение
// Состояние одноразовое: очищается после обработки ввода, команды или кнопки меню.

export async function getBotDialogState(userId: string) {
  const dialog = await prisma.telegramBotDialog.findUnique({ where: { userId }, select: { state: true } })
  return dialog?.state ?? null
}

export async function setBotDialogState(userId: string, state: string, payload?: string | null) {
  await prisma.telegramBotDialog.upsert({
    where: { userId },
    create: { userId, state, payload: payload ?? null },
    update: { state, payload: payload ?? null },
  })
}

export async function clearBotDialogState(userId: string) {
  await prisma.telegramBotDialog.deleteMany({ where: { userId } })
}

// Webhook вызывает до передачи сообщения старому боту: с ожидающим состоянием
// оно принадлежит новому обработчику, даже если это произвольный текст
// или фото для рассылки.
export async function getBotDialogStateByTelegram(telegramId: number) {
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: { botDialog: { select: { state: true } } },
  })
  return user?.botDialog?.state ?? null
}
