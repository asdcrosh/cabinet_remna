import type { SupportCategoryValue } from '@/lib/support'
import type { PaymentProvider } from '@prisma/client'

export type TicketStatus = 'OPEN' | 'WAITING_ADMIN' | 'WAITING_USER' | 'CLOSED'
export type SenderRole = 'USER' | 'ADMIN'
export type TicketFolder = 'active' | 'need-answer' | 'answered' | 'closed'
export type AdminSupportAssigneeScope = 'all' | 'mine' | 'unassigned'

export interface SupportStaffMember {
  id: string
  email: string
  name: string | null
  role: string
}

export interface SupportInternalNote {
  id: string
  body: string
  createdAt: string
  author: Pick<SupportStaffMember, 'id' | 'email' | 'name'> | null
}

export interface SupportAuditEvent {
  id: string
  message: string
  createdAt: string
  actor: Pick<SupportStaffMember, 'id' | 'email' | 'name'> | null
}

export interface SupportMessage {
  id: string
  body: string
  senderRole: SenderRole
  createdAt: string
  deliveryState?: 'sending'
  sender?: {
    email: string
    name: string | null
  } | null
  attachments?: Array<{
    id: string
    fileName: string
    mimeType: string
    sizeBytes: number
    createdAt: string
  }>
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
  updatedAt: string
  closedAt: string | null
  assignedAt?: string | null
  assignee?: Pick<SupportStaffMember, 'id' | 'email' | 'name'> | null
  internalNotes?: SupportInternalNote[]
  auditEvents?: SupportAuditEvent[]
  user?: {
    id: string
    email: string
    name: string | null
    telegramId?: string | null
    telegramUsername?: string | null
    remnashopUserId?: number | null
    remnashopSyncedAt?: string | null
    remnawaveId?: number | null
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
      provider: PaymentProvider
      status: string
      externalPaymentId: string | null
      yookassaId: string | null
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
  initialTicketId?: string
  slaWarningMinutes?: number
  slaBreachMinutes?: number
  adminQuickReplies?: string[]
  initialTotal?: number
  pageSize?: number
  initialQuery?: string
  initialFolder?: TicketFolder
  initialCounts?: SupportQueueCounts
  initialAssigneeScope?: AdminSupportAssigneeScope
  currentStaffId?: string
  staffMembers?: SupportStaffMember[]
  initialCategory?: SupportCategoryValue
  initialMessage?: string
  initialNewTicketOpen?: boolean
}

export function buildAdminSupportPath(input: {
  folder: TicketFolder
  assigneeScope: AdminSupportAssigneeScope
  query?: string
  ticketId?: string
}) {
  const params = new URLSearchParams()
  params.set('folder', input.folder)
  params.set('assignee', input.assigneeScope)
  if (input.query?.trim()) params.set('q', input.query.trim())
  if (input.ticketId?.trim()) params.set('ticket', input.ticketId.trim())
  return `/dashboard/admin/support?${params.toString()}`
}

export function sanitizeAdminSupportReturnPath(value: string | null | undefined) {
  const path = value?.trim() ?? ''
  if (!path.startsWith('/dashboard/admin/support')) return ''
  const suffix = path.slice('/dashboard/admin/support'.length, '/dashboard/admin/support'.length + 1)
  return !suffix || suffix === '?' || suffix === '#' ? path : ''
}

export function appendReturnTo(href: string, returnTo: string) {
  if (!returnTo) return href
  const hashIndex = href.indexOf('#')
  const pathAndQuery = hashIndex >= 0 ? href.slice(0, hashIndex) : href
  const hash = hashIndex >= 0 ? href.slice(hashIndex + 1) : ''
  const separator = pathAndQuery.includes('?') ? '&' : '?'
  return `${pathAndQuery}${separator}returnTo=${encodeURIComponent(returnTo)}${hash ? `#${hash}` : ''}`
}

export function getSupportSlaState(
  value: string,
  warningMinutes: number,
  breachMinutes: number,
  now = Date.now()
) {
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000))
  const duration = minutes < 60
    ? `${Math.max(1, minutes)} мин`
    : minutes < 24 * 60
      ? `${Math.floor(minutes / 60)} ч`
      : `${Math.floor(minutes / (24 * 60))} дн`
  return {
    minutes,
    duration,
    state: minutes >= breachMinutes ? 'breached' as const : minutes >= warningMinutes ? 'warning' as const : 'ok' as const,
  }
}

export function formatSupportTicketAge(value: string, now = Date.now()) {
  const { duration } = getSupportSlaState(value, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, now)
  return duration
}

export type SupportQueueCounts = Record<TicketFolder, number> & { all: number }

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
