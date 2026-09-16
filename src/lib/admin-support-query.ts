import { Prisma } from '@prisma/client'

export type AdminSupportFolder = 'need-answer' | 'active' | 'answered' | 'closed'
export type AdminSupportAssigneeScope = 'all' | 'mine' | 'unassigned'

export const DEFAULT_ADMIN_SUPPORT_FOLDER: AdminSupportFolder = 'need-answer'

export function parseAdminSupportFolder(value: string | null | undefined): AdminSupportFolder {
  return value === 'active' || value === 'answered' || value === 'closed' || value === 'need-answer'
    ? value
    : DEFAULT_ADMIN_SUPPORT_FOLDER
}

export function parseAdminSupportAssigneeScope(value: string | null | undefined): AdminSupportAssigneeScope {
  return value === 'mine' || value === 'unassigned' ? value : 'all'
}

export function buildAdminSupportSearchWhere(query: string): Prisma.SupportTicketWhereInput {
  const q = query.trim()
  if (!q) return {}

  const numericId = /^\d+$/.test(q) ? Number(q) : null
  const telegramId = parsePostgresBigInt(q)
  const OR: Prisma.SupportTicketWhereInput[] = [
    { id: { contains: q, mode: 'insensitive' } },
    { subject: { contains: q, mode: 'insensitive' } },
    { messages: { some: { body: { contains: q, mode: 'insensitive' } } } },
    { user: { email: { contains: q, mode: 'insensitive' } } },
    { user: { name: { contains: q, mode: 'insensitive' } } },
    { user: { telegramUsername: { contains: q.replace(/^@/, ''), mode: 'insensitive' } } },
    { user: { remnawaveUsername: { contains: q, mode: 'insensitive' } } },
    { assignee: { email: { contains: q, mode: 'insensitive' } } },
    { assignee: { name: { contains: q, mode: 'insensitive' } } },
    { user: { payments: { some: { externalPaymentId: { contains: q, mode: 'insensitive' } } } } },
    { user: { payments: { some: { yookassaId: { contains: q, mode: 'insensitive' } } } } },
  ]

  if (telegramId != null) OR.push({ user: { telegramId } })

  if (numericId != null && Number.isSafeInteger(numericId)) {
    OR.push(
      { user: { remnawaveId: numericId } },
      { user: { remnashopUserId: numericId } }
    )
  }

  return { OR }
}

export function buildAdminSupportAssigneeWhere(
  scope: AdminSupportAssigneeScope,
  currentStaffId: string
): Prisma.SupportTicketWhereInput {
  if (scope === 'mine') return { assigneeId: currentStaffId }
  if (scope === 'unassigned') return { assigneeId: null }
  return {}
}

export function buildAdminSupportFolderWhere(folder: AdminSupportFolder): Prisma.SupportTicketWhereInput {
  if (folder === 'need-answer') return { status: 'WAITING_ADMIN' }
  if (folder === 'answered') return { status: 'WAITING_USER' }
  if (folder === 'closed') return { status: 'CLOSED' }
  return { status: { not: 'CLOSED' } }
}

export function buildAdminSupportOrderBy(folder: AdminSupportFolder): Prisma.SupportTicketOrderByWithRelationInput[] {
  if (folder === 'need-answer') {
    return [{ lastMessageAt: 'asc' }, { id: 'asc' }]
  }
  return [{ adminUnreadCount: 'desc' }, { lastMessageAt: 'desc' }, { id: 'desc' }]
}

export function buildAdminSupportWhere(folder: AdminSupportFolder, query: string): Prisma.SupportTicketWhereInput {
  return {
    AND: [buildAdminSupportSearchWhere(query), buildAdminSupportFolderWhere(folder)],
  }
}

function parsePostgresBigInt(value: string) {
  if (!/^\d+$/.test(value)) return null
  try {
    const parsed = BigInt(value)
    return parsed <= 9_223_372_036_854_775_807n ? parsed : null
  } catch {
    return null
  }
}
