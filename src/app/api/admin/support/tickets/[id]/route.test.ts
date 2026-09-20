import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  writeAuditLog: vi.fn(),
  prisma: {
    user: { findFirst: vi.fn() },
    supportTicket: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth/guard', () => ({
  requireStaff: mocks.requireStaff,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/notifications', () => ({ notifySupportReply: vi.fn() }))
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: () => true }))

import { GET, PATCH } from './route'

const ticket = {
  id: 'ticket-1',
  userId: 'user-1',
  assigneeId: null,
  subject: 'Оплата',
  category: 'payment',
  status: 'WAITING_ADMIN',
  userUnreadCount: 0,
  adminUnreadCount: 1,
  lastMessageAt: new Date('2026-09-17T08:00:00.000Z'),
  assignedAt: null,
  closedAt: null,
  createdAt: new Date('2026-09-17T08:00:00.000Z'),
  updatedAt: new Date('2026-09-17T08:00:00.000Z'),
}

describe('admin support assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaff.mockResolvedValue({ uid: 'staff-1', role: 'ADMIN' })
    mocks.prisma.supportTicket.findUnique.mockResolvedValue({
      id: ticket.id,
      status: ticket.status,
      userId: ticket.userId,
      assigneeId: ticket.assigneeId,
      updatedAt: ticket.updatedAt,
    })
    mocks.prisma.supportTicket.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.auditLog.findMany.mockResolvedValue([])
  })

  it('marks the ticket as read without invalidating its optimistic version', async () => {
    mocks.prisma.supportTicket.findUnique.mockResolvedValue({
      ...ticket,
      assignee: null,
      user: null,
      messages: [],
      internalNotes: [],
    })
    mocks.prisma.supportTicket.updateMany.mockResolvedValue({ count: 1 })

    const response = await GET(
      new Request('https://cabinet.example/api/admin/support/tickets/ticket-1'),
      { params: Promise.resolve({ id: 'ticket-1' }) },
    )
    const body = await response.json()

    expect(body.ticket.adminUnreadCount).toBe(0)
    expect(body.ticket.updatedAt).toBe(ticket.updatedAt.toISOString())
    expect(mocks.prisma.supportTicket.updateMany).toHaveBeenCalledWith({
      where: {
        id: ticket.id,
        updatedAt: ticket.updatedAt,
        adminUnreadCount: { gt: 0 },
      },
      data: {
        adminUnreadCount: 0,
        updatedAt: ticket.updatedAt,
      },
    })
  })

  it('assigns a ticket only to a staff member', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({ id: 'staff-2' })
    mocks.prisma.supportTicket.findUnique
      .mockResolvedValueOnce({
        id: ticket.id,
        status: ticket.status,
        userId: ticket.userId,
        assigneeId: ticket.assigneeId,
        updatedAt: ticket.updatedAt,
      })
      .mockResolvedValueOnce({
        ...ticket,
        updatedAt: new Date('2026-09-17T09:00:00.000Z'),
        assigneeId: 'staff-2',
        assignedAt: new Date('2026-09-17T09:00:00.000Z'),
        assignee: { id: 'staff-2', email: 'operator@example.com', name: 'Оператор' },
      })

    const response = await PATCH(
      new Request('https://cabinet.example/api/admin/support/tickets/ticket-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assigneeId: 'staff-2',
          expectedUpdatedAt: ticket.updatedAt.toISOString(),
        }),
      }),
      { params: Promise.resolve({ id: 'ticket-1' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'staff-2',
        role: { in: ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'] },
      },
    }))
    expect(body.ticket.assignee.id).toBe('staff-2')
    expect(mocks.prisma.supportTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ticket.id, updatedAt: ticket.updatedAt },
    }))
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce()
  })

  it('rejects assignment to a regular user', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(null)

    const response = await PATCH(
      new Request('https://cabinet.example/api/admin/support/tickets/ticket-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assigneeId: 'user-2',
          expectedUpdatedAt: ticket.updatedAt.toISOString(),
        }),
      }),
      { params: Promise.resolve({ id: 'ticket-1' }) },
    )

    expect(response.status).toBe(400)
    expect(mocks.prisma.supportTicket.updateMany).not.toHaveBeenCalled()
  })

  it('returns the current ticket instead of overwriting a concurrent update', async () => {
    const current = {
      ...ticket,
      status: 'WAITING_USER',
      updatedAt: new Date('2026-09-17T09:05:00.000Z'),
      assigneeId: 'staff-2',
      assignee: { id: 'staff-2', email: 'operator@example.com', name: 'Оператор' },
    }
    mocks.prisma.supportTicket.updateMany.mockResolvedValue({ count: 0 })
    mocks.prisma.supportTicket.findUnique
      .mockResolvedValueOnce({
        id: ticket.id,
        status: ticket.status,
        userId: ticket.userId,
        assigneeId: ticket.assigneeId,
        updatedAt: ticket.updatedAt,
      })
      .mockResolvedValueOnce(current)

    const response = await PATCH(
      new Request('https://cabinet.example/api/admin/support/tickets/ticket-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'CLOSED',
          expectedUpdatedAt: ticket.updatedAt.toISOString(),
        }),
      }),
      { params: Promise.resolve({ id: 'ticket-1' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toContain('другой сотрудник')
    expect(body.ticket.status).toBe('WAITING_USER')
    expect(body.ticket.assignee.id).toBe('staff-2')
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })
})
