import { prisma } from '@/lib/prisma'

// Состояния диалога бота:
//   support:new:<category>      — ждём текст нового обращения
//   support:reply:<ticketId>    — ждём сообщение в существующий тикет
// Состояние одноразовое: очищается после обработки ввода, команды или кнопки меню.

export async function getBotDialogState(userId: string) {
  const dialog = await prisma.telegramBotDialog.findUnique({ where: { userId }, select: { state: true } })
  return dialog?.state ?? null
}

export async function setBotDialogState(userId: string, state: string) {
  await prisma.telegramBotDialog.upsert({
    where: { userId },
    create: { userId, state },
    update: { state },
  })
}

export async function clearBotDialogState(userId: string) {
  await prisma.telegramBotDialog.deleteMany({ where: { userId } })
}

// Webhook вызывает до передачи текста старому боту: сообщение с ожидающим
// состоянием принадлежит новому обработчику, даже если это произвольный текст.
export async function hasPendingBotDialog(telegramId: number) {
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: { botDialog: { select: { userId: true } } },
  })
  return Boolean(user?.botDialog)
}
