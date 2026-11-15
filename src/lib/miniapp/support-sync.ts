import { prisma } from '@/lib/prisma'
import { getBotAdminThreadScreen, getBotAdminTicketsScreen, getBotSupportThreadScreen } from './bot-screens'
import { displayCallbackScreen } from './callback-screen'

// Одно окно переписки в боте: сообщение с тикетом редактируется на месте
// и у пользователя, и у администратора — новых сообщений не появляется.
// Якоря (chat_id + message_id) лежат на тикете; если Telegram отклонил правку
// и экран ушёл новым сообщением, якорь обновляется на его id.

export async function refreshUserThreadView(ticketId: string): Promise<boolean> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { userBotMessageId: true, user: { select: { telegramId: true } } },
  })
  if (!ticket?.userBotMessageId || !ticket.user.telegramId) return false
  const chatId = Number(ticket.user.telegramId)
  const html = await getBotSupportThreadScreen(chatId, ticketId)
  const used = await displayCallbackScreen(chatId, ticket.userBotMessageId, html)
  if (used && used !== ticket.userBotMessageId) {
    await prisma.supportTicket.updateMany({ where: { id: ticketId }, data: { userBotMessageId: used } })
  }
  return used != null
}

export async function refreshAdminThreadView(ticketId: string, notice?: string): Promise<boolean> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { adminBotChatId: true, adminBotMessageId: true },
  })
  if (!ticket?.adminBotChatId || !ticket.adminBotMessageId) return false
  const chatId = Number(ticket.adminBotChatId)
  const html = await getBotAdminThreadScreen(chatId, ticketId, notice)
  const used = await displayCallbackScreen(chatId, ticket.adminBotMessageId, html)
  if (used && used !== ticket.adminBotMessageId) {
    await prisma.supportTicket.updateMany({ where: { id: ticketId }, data: { adminBotMessageId: used } })
  }
  return used != null
}

// Синхронизация — фоновое улучшение: сбой обновления окна не должен
// ломать основное действие (ответ, закрытие обращения).
export async function syncSupportThreadViews(ticketId: string, opts: { user?: boolean; admin?: boolean; adminNotice?: string } = {}) {
  const tasks: Promise<unknown>[] = []
  if (opts.user) tasks.push(refreshUserThreadView(ticketId))
  if (opts.admin) tasks.push(refreshAdminThreadView(ticketId, opts.adminNotice))
  await Promise.allSettled(tasks)
}

// Очередь обращений у администраторов: обновляется на месте при новых
// обращениях, ответах и закрытиях — как открытый тред.
export async function refreshAdminTicketsQueues(notice?: string) {
  const admins = await prisma.user.findMany({
    where: { adminQueueBotMessageId: { not: null }, role: { not: 'USER' }, telegramId: { not: null } },
    select: { id: true, telegramId: true, adminQueueBotMessageId: true },
    take: 25,
  })
  await Promise.allSettled(admins.map(async (admin) => {
    if (!admin.telegramId || !admin.adminQueueBotMessageId) return
    const chatId = Number(admin.telegramId)
    const html = await getBotAdminTicketsScreen(chatId, notice)
    const used = await displayCallbackScreen(chatId, admin.adminQueueBotMessageId, html)
    if (used && used !== admin.adminQueueBotMessageId) {
      await prisma.user.updateMany({ where: { id: admin.id }, data: { adminQueueBotMessageId: used } })
    }
  }))
}

export async function syncAdminTicketsQueues(notice?: string) {
  await refreshAdminTicketsQueues(notice).catch(() => {})
}
