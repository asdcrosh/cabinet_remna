import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  writeAuditLog: vi.fn(),
  prisma: {
    user: { findFirst: vi.fn() },
    supportTicket: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/auth/guard', () => ({
  requireStaff: mocks.requireStaff,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: () => true }))

import { POST } from './route'

const date = new Date('2026-09-19T10:00:00.000Z')

describe('bulk support operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaff.mockResolvedValue({ uid: 'admin-1' })
    mocks.prisma.supportTicket.findMany.mockResolvedValue([
      { id: 'ticket-1', userId: 'user-1', status: 'WAITING_ADMIN', assigneeId: null },
      { id: 'ticket-2', userId: 'user-2', status: 'WAITING_ADMIN', assigneeId: null },
    ])
    mocks.prisma.supportTicket.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    mocks.prisma.supportTicket.findUnique.mockResolvedValue({
      id: 'ticket-1',
      userId: 'user-1',
      assigneeId: null,
      assignee: null,
      subject: 'Оплата',
      category: 'payment',
      status: 'CLOSED',
      userUnreadCount: 0,
      adminUnreadCount: 0,
      lastMessageAt: date,
      assignedAt: null,
      closedAt: date,
      createdAt: date,
      updatedAt: date,
    })
  })

  it('returns successful and conflicting tickets separately and audits successes', async () => {
    const response = await POST(new Request('https://cabinet.example/api/admin/support/tickets/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickets: [
          { id: 'ticket-1', expectedUpdatedAt: date.toISOString() },
          { id: 'ticket-2', expectedUpdatedAt: date.toISOString() },
        ],
        action: { type: 'close' },
      }),
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.updated).toHaveLength(1)
    expect(body.failed).toEqual([{ id: 'ticket-2', reason: 'conflict' }])
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ ticketId: 'ticket-1', bulk: true }),
    }))
  })

  it('validates the assignee before changing any ticket', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(null)
    const response = await POST(new Request('https://cabinet.example/api/admin/support/tickets/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickets: [{ id: 'ticket-1', expectedUpdatedAt: date.toISOString() }],
        action: { type: 'assign', assigneeId: 'user-1' },
      }),
    }))

    expect(response.status).toBe(400)
    expect(mocks.prisma.supportTicket.updateMany).not.toHaveBeenCalled()
  })
})
