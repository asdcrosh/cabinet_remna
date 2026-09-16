import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  writeAuditLog: vi.fn(),
  prisma: {
    supportTicket: { findUnique: vi.fn() },
    supportInternalNote: { create: vi.fn() },
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

describe('admin support internal notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaff.mockResolvedValue({ uid: 'staff-1', role: 'ADMIN' })
    mocks.prisma.supportTicket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: 'user-1' })
    mocks.prisma.supportInternalNote.create.mockResolvedValue({
      id: 'note-1',
      body: 'Проверить историю платежа',
      createdAt: new Date('2026-09-17T09:00:00.000Z'),
      author: { id: 'staff-1', email: 'staff@example.com', name: 'Оператор' },
    })
  })

  it('creates a private note without changing the ticket conversation', async () => {
    const response = await POST(
      new Request('https://cabinet.example/api/admin/support/tickets/ticket-1/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'Проверить историю платежа' }),
      }),
      { params: Promise.resolve({ id: 'ticket-1' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.prisma.supportInternalNote.create).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        ticketId: 'ticket-1',
        authorId: 'staff-1',
        body: 'Проверить историю платежа',
      },
    }))
    expect(body.note.createdAt).toBe('2026-09-17T09:00:00.000Z')
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce()
  })

  it('rejects an empty note', async () => {
    const response = await POST(
      new Request('https://cabinet.example/api/admin/support/tickets/ticket-1/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: '   ' }),
      }),
      { params: Promise.resolve({ id: 'ticket-1' }) },
    )

    expect(response.status).toBe(400)
    expect(mocks.prisma.supportInternalNote.create).not.toHaveBeenCalled()
  })
})
