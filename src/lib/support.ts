import { z } from 'zod'

export const supportCategories = [
  { value: 'payment', label: 'Оплата' },
  { value: 'connection', label: 'Подключение' },
  { value: 'subscription', label: 'Подписка' },
  { value: 'general', label: 'Другое' },
] as const

export const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  category: z.enum(['payment', 'connection', 'subscription', 'general']).default('general'),
  message: z.string().trim().min(5).max(3000),
})

export const createSupportMessageSchema = z.object({
  message: z.string().trim().min(1).max(3000),
})

export const updateSupportTicketSchema = z.object({
  status: z.enum(['OPEN', 'WAITING_ADMIN', 'WAITING_USER', 'CLOSED']),
})

export const userUpdateSupportTicketSchema = z.object({
  status: z.enum(['CLOSED']),
})

export function supportStatusLabel(status: string) {
  const labels: Record<string, string> = {
    OPEN: 'Открыто',
    WAITING_ADMIN: 'Ждет поддержки',
    WAITING_USER: 'Ждет пользователя',
    CLOSED: 'Закрыто',
  }
  return labels[status] ?? status
}

export function supportCategoryLabel(category: string) {
  return supportCategories.find((item) => item.value === category)?.label ?? 'Другое'
}

export function serializeSupportTicket<T extends {
  createdAt: Date
  updatedAt: Date
  lastMessageAt: Date
  closedAt: Date | null
}>(ticket: T) {
  return {
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    lastMessageAt: ticket.lastMessageAt.toISOString(),
    closedAt: ticket.closedAt?.toISOString() ?? null,
  }
}

export function serializeSupportMessage<T extends { createdAt: Date }>(message: T) {
  return {
    ...message,
    createdAt: message.createdAt.toISOString(),
  }
}
