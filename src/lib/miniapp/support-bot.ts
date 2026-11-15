import { prisma } from '@/lib/prisma'
import { rateLimitKey } from '@/lib/rate-limit'
import { supportCategories, supportCategorySubject, type SupportCategoryValue } from '@/lib/support'
import { createAdminNotification } from '@/lib/admin-notifications'
import { buildAdminSupportTelegramText } from '@/lib/admin-telegram-notifications'
import { notifySupportReply } from '@/lib/notifications'
import { writeAuditLog } from '@/lib/audit-log'
import { syncSupportThreadViews } from './support-sync'

export type BotSupportResult = { ok: true } | { ok: false; error: string }

const categoryValues = new Set<string>(supportCategories.map(category => category.value))
export function isSupportCategory(value: string): value is SupportCategoryValue {
  return categoryValues.has(value)
}

// Обращения из бота проходят через те же таблицы и уведомления, что и из кабинета:
// диалог виден в обоих местах сразу.
export async function createTicketFromBot(userId: string, category: SupportCategoryValue, message: string): Promise<BotSupportResult> {
  const text = message.trim()
  if (text.length < 5) return { ok: false, error: 'Напишите чуть подробнее — от 5 символов.' }
  if (text.length > 3000) return { ok: false, error: 'Сообщение слишком длинное. Сократите до 3000 символов.' }
  const limited = await rateLimitKey(`bot-support:create:${userId}`, 5, 10 * 60 * 1000)
  if (!limited.ok) return { ok: false, error: 'Слишком много обращений. Попробуйте позже.' }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId,
      subject: supportCategorySubject(category),
      category,
      status: 'WAITING_ADMIN',
      adminUnreadCount: 1,
      messages: { create: { senderId: userId, senderRole: 'USER', body: text } },
    },
    select: { id: true, subject: true },
  })
  await notifyAdmins(userId, 'ticket', ticket.id, ticket.subject, text)
  return { ok: true }
}

export async function replyToTicketFromBot(userId: string, ticketId: string, message: string): Promise<BotSupportResult> {
  const text = message.trim()
  if (!text) return { ok: false, error: 'Напишите сообщение перед отправкой.' }
  if (text.length > 3000) return { ok: false, error: 'Сообщение слишком длинное. Сократите до 3000 символов.' }
  const limited = await rateLimitKey(`bot-support:message:${userId}`, 20, 10 * 60 * 1000)
  if (!limited.ok) return { ok: false, error: 'Слишком много сообщений. Попробуйте позже.' }

  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, userId }, select: { id: true, subject: true, status: true } })
  if (!ticket) return { ok: false, error: 'Обращение не найдено.' }
  if (ticket.status === 'CLOSED') return { ok: false, error: 'Обращение уже закрыто. Создайте новое.' }

  const created = await prisma.$transaction(async tx => {
    const message = await tx.supportMessage.create({
      data: { ticketId: ticket.id, senderId: userId, senderRole: 'USER', body: text },
      select: { id: true, createdAt: true },
    })
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { status: 'WAITING_ADMIN', adminUnreadCount: { increment: 1 }, lastMessageAt: message.createdAt },
    })
    return message
  })
  await notifyAdmins(userId, 'message', ticket.id, ticket.subject, text, created.id)
  // Открытое окно переписки у администратора обновляется на месте.
  await syncSupportThreadViews(ticket.id, { admin: true, adminNotice: '💬 Новое сообщение от пользователя.' })
  return { ok: true }
}

export async function closeTicketFromBot(userId: string, ticketId: string): Promise<BotSupportResult> {
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, userId }, select: { id: true, status: true } })
  if (!ticket) return { ok: false, error: 'Обращение не найдено.' }
  if (ticket.status === 'CLOSED') return { ok: true }
  await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'CLOSED', closedAt: new Date() } })
  await syncSupportThreadViews(ticketId, { admin: true, adminNotice: '✅ Пользователь закрыл обращение.' })
  return { ok: true }
}

// Ответ администратора из бота: то же сообщение, что отправляет панель
// кабинета — пользователь получает его в бот и в переписку кабинета.
export async function replyToTicketAsAdmin(adminId: string, ticketId: string, message: string): Promise<BotSupportResult> {
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { role: true } })
  if (!admin || admin.role === 'USER') return { ok: false, error: 'Раздел доступен администраторам.' }
  const text = message.trim()
  if (!text) return { ok: false, error: 'Напишите сообщение перед отправкой.' }
  if (text.length > 3000) return { ok: false, error: 'Сообщение слишком длинное. Сократите до 3000 символов.' }
  const limited = await rateLimitKey(`bot-support:admin:${adminId}`, 40, 10 * 60 * 1000)
  if (!limited.ok) return { ok: false, error: 'Слишком много сообщений. Попробуйте позже.' }

  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true, userId: true, status: true, assigneeId: true } })
  if (!ticket) return { ok: false, error: 'Обращение не найдено.' }
  if (ticket.status === 'CLOSED') return { ok: false, error: 'Обращение уже закрыто.' }

  const created = await prisma.$transaction(async tx => {
    const message = await tx.supportMessage.create({
      data: { ticketId: ticket.id, senderId: adminId, senderRole: 'ADMIN', body: text },
      select: { id: true, createdAt: true },
    })
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: 'WAITING_USER',
        userUnreadCount: { increment: 1 },
        adminUnreadCount: 0,
        lastMessageAt: message.createdAt,
        ...(!ticket.assigneeId ? { assigneeId: adminId, assignedAt: message.createdAt } : {}),
      },
    })
    return message
  })
  await notifySupportReply({ ticketId: ticket.id, messageId: created.id })
  await writeAuditLog({
    actorId: adminId,
    targetId: ticket.userId,
    action: 'ADMIN_SUPPORT_UPDATED',
    message: 'Администратор ответил в обращении из бота',
    metadata: { ticketId: ticket.id, messageId: created.id, fromStatus: ticket.status, toStatus: 'WAITING_USER' },
  })
  return { ok: true }
}

export async function closeTicketAsAdmin(adminId: string, ticketId: string): Promise<BotSupportResult> {
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { role: true } })
  if (!admin || admin.role === 'USER') return { ok: false, error: 'Раздел доступен администраторам.' }
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true, userId: true, status: true } })
  if (!ticket) return { ok: false, error: 'Обращение не найдено.' }
  if (ticket.status !== 'CLOSED') {
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'CLOSED', closedAt: new Date() } })
    await writeAuditLog({
      actorId: adminId,
      targetId: ticket.userId,
      action: 'ADMIN_SUPPORT_UPDATED',
      message: 'Администратор закрыл обращение из бота',
      metadata: { ticketId: ticket.id, fromStatus: ticket.status, toStatus: 'CLOSED' },
    })
    // Окно переписки у пользователя сразу показывает «Закрыто».
    await syncSupportThreadViews(ticketId, { user: true })
  }
  return { ok: true }
}

async function notifyAdmins(userId: string, kind: 'ticket' | 'message', ticketId: string, subject: string, text: string, messageId?: string) {
  const customer = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, telegramUsername: true },
  })
  await createAdminNotification({
    type: 'support',
    severity: 'INFO',
    dedupeKey: kind === 'ticket' ? `admin:support-ticket:${ticketId}` : `admin:support-message:${messageId}`,
    title: kind === 'ticket' ? 'Новое обращение в поддержку' : 'Новое сообщение в поддержку',
    body: `${subject}: ${text.slice(0, 180)}`,
    entityType: 'supportTicket',
    entityId: ticketId,
    actionHref: '/dashboard/admin/support',
    actionLabel: 'Открыть поддержку',
    ...(customer
      ? {
          telegram: {
            text: buildAdminSupportTelegramText({
              kind,
              subject,
              message: text,
              customerName: customer.name,
              customerEmail: customer.email,
              telegramUsername: customer.telegramUsername,
            }),
            actionHref: `/dashboard/admin/support?q=${encodeURIComponent(ticketId)}`,
            actionLabel: 'Открыть и ответить',
          },
        }
      : {}),
  })
}
