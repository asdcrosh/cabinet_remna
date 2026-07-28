export type TicketStatus = 'OPEN' | 'WAITING_ADMIN' | 'WAITING_USER' | 'CLOSED'
export type SenderRole = 'USER' | 'ADMIN'
export type TicketFolder = 'active' | 'need-answer' | 'answered' | 'closed'

export interface SupportMessage {
  id: string
  body: string
  senderRole: SenderRole
  createdAt: string
  sender?: {
    email: string
    name: string | null
  } | null
}

export interface SupportTicket {
  id: string
  subject: string
  category: string
  status: TicketStatus
  userUnreadCount: number
  adminUnreadCount: number
  lastMessageAt: string
  createdAt: string
  closedAt: string | null
  user?: {
    id: string
    email: string
    name: string | null
    telegramId?: string | null
    remnashopUserId?: number | null
    remnashopSyncedAt?: string | null
    remnawaveUuid?: string | null
    remnawaveUsername?: string | null
    subscriptions?: Array<{
      id: string
      status: string
      expireAt: string
      pendingSync: boolean
      plan: { name: string } | null
    }>
    payments?: Array<{
      id: string
      status: string
      amountKopecks: number
      paidAt: string | null
      createdAt: string
      subscriptionProvisionedAt: string | null
      provisioningError: string | null
      remnashopSyncedAt: string | null
      remnashopSyncError: string | null
      plan: { name: string } | null
    }>
  } | null
  messages: SupportMessage[]
  messagePagination?: {
    hasMore: boolean
    before: string | null
  }
}

export interface SupportPanelProps {
  mode: 'user' | 'admin'
  initialTickets: SupportTicket[]
  initialTotal?: number
  pageSize?: number
}

export function getUnreadCount(ticket: SupportTicket, mode: 'user' | 'admin') {
  return mode === 'admin' ? ticket.adminUnreadCount : ticket.userUnreadCount
}

export function needsCurrentActor(ticket: SupportTicket, mode: 'user' | 'admin') {
  if (mode === 'admin') return ticket.status === 'WAITING_ADMIN'
  return ticket.userUnreadCount > 0 || ticket.status === 'WAITING_USER'
}

export function mergeSupportTicket(current: SupportTicket, incoming: SupportTicket, preservePagination = false) {
  const messages = new Map<string, SupportMessage>()
  for (const message of [...current.messages, ...incoming.messages]) messages.set(message.id, message)

  return {
    ...current,
    ...incoming,
    messages: [...messages.values()].sort((left, right) => {
      const dateOrder = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      return dateOrder || left.id.localeCompare(right.id)
    }),
    messagePagination: preservePagination && current.messagePagination
      ? current.messagePagination
      : incoming.messagePagination,
  }
}

export function getSupportTicketCursor(ticket: SupportTicket | undefined) {
  if (!ticket) return null
  return `${ticket.adminUnreadCount}|${ticket.lastMessageAt}|${ticket.id}`
}

export function insertAtSelection(value: string, insert: string, start: number, end: number, maxLength: number) {
  const safeStart = Math.max(0, Math.min(start, value.length))
  const safeEnd = Math.max(safeStart, Math.min(end, value.length))
  const nextValue = `${value.slice(0, safeStart)}${insert}${value.slice(safeEnd)}`.slice(0, maxLength)
  return {
    value: nextValue,
    cursor: Math.min(safeStart + insert.length, nextValue.length),
  }
}

export function formatSupportDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatSupportPrice(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value / 100)
}
