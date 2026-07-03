import { z } from 'zod'

export const supportCategories = [
  {
    value: 'connection',
    label: 'Подключение',
    subject: 'Проблема с подключением',
    description: 'VPN не подключается, нет интернета или ошибка на устройстве.',
  },
  {
    value: 'payment',
    label: 'Оплата',
    subject: 'Вопрос по оплате',
    description: 'Платёж, чек, продление или ошибка при покупке.',
  },
  {
    value: 'subscription',
    label: 'Подписка',
    subject: 'Вопрос по подписке',
    description: 'Срок, тариф, перенос или доступ к подписке.',
  },
  {
    value: 'devices',
    label: 'Устройства',
    subject: 'Вопрос по устройствам',
    description: 'QR-код, приложение, новое устройство или отвязка старого.',
  },
  {
    value: 'speed',
    label: 'Скорость',
    subject: 'Проблема со скоростью',
    description: 'Медленная работа, высокий пинг или нестабильное соединение.',
  },
  {
    value: 'general',
    label: 'Другое',
    subject: 'Другой вопрос',
    description: 'Если вопрос не подходит под остальные пункты.',
  },
] as const

export type SupportCategoryValue = typeof supportCategories[number]['value']

export const createSupportTicketSchema = z.object({
  subject: z.never().optional(),
  category: z.enum(['payment', 'connection', 'subscription', 'devices', 'speed', 'general']).default('connection'),
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
    WAITING_ADMIN: 'Ожидает ответа',
    WAITING_USER: 'Ответ отправлен',
    CLOSED: 'Закрыто',
  }
  return labels[status] ?? status
}

export function supportStatusLabelForRole(status: string, role: 'user' | 'admin') {
  if (status === 'WAITING_ADMIN') {
    return role === 'admin' ? 'Нужно ответить' : 'Ждём поддержку'
  }
  if (status === 'WAITING_USER') {
    return role === 'admin' ? 'Ждёт пользователя' : 'Есть ответ'
  }
  return supportStatusLabel(status)
}

export function supportCategoryLabel(category: string) {
  return supportCategories.find((item) => item.value === category)?.label ?? 'Другое'
}

export function supportCategoryDescription(category: string) {
  return supportCategories.find((item) => item.value === category)?.description ?? supportCategories.at(-1)?.description ?? ''
}

export function supportCategorySubject(category: string) {
  return supportCategories.find((item) => item.value === category)?.subject ?? 'Другой вопрос'
}

export function serializeSupportTicket<T extends {
  createdAt: Date
  updatedAt: Date
  lastMessageAt: Date
  closedAt: Date | null
  user?: {
    telegramId?: bigint | null
    remnashopSyncedAt?: Date | null
    subscriptions?: Array<{ expireAt: Date }>
    payments?: Array<{
      paidAt: Date | null
      createdAt: Date
      subscriptionProvisionedAt: Date | null
      remnashopSyncedAt: Date | null
    }>
  } | null
}>(ticket: T): any {
  return {
    ...ticket,
    user: ticket.user ? serializeSupportUser(ticket.user) : ticket.user,
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

function serializeSupportUser<T extends {
  telegramId?: bigint | null
  remnashopSyncedAt?: Date | null
  subscriptions?: Array<{ expireAt: Date }>
  payments?: Array<{
    paidAt: Date | null
    createdAt: Date
    subscriptionProvisionedAt: Date | null
    remnashopSyncedAt: Date | null
  }>
}>(user: T) {
  return {
    ...user,
    telegramId: user.telegramId?.toString() ?? null,
    remnashopSyncedAt: user.remnashopSyncedAt?.toISOString() ?? null,
    subscriptions: user.subscriptions?.map((subscription) => ({
      ...subscription,
      expireAt: subscription.expireAt.toISOString(),
    })),
    payments: user.payments?.map((payment) => ({
      ...payment,
      paidAt: payment.paidAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
      subscriptionProvisionedAt: payment.subscriptionProvisionedAt?.toISOString() ?? null,
      remnashopSyncedAt: payment.remnashopSyncedAt?.toISOString() ?? null,
    })),
  }
}
