import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class TestRemnawaveError extends Error {
    constructor(public status: number, public body: unknown, message = 'Remnawave error') {
      super(message)
    }
  }
  return {
    TestRemnawaveError,
    requireAdmin: vi.fn(),
    userFindUnique: vi.fn(),
    terminateUserSubscription: vi.fn(),
    writeAuditLog: vi.fn(),
  }
})

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
  },
}))
vi.mock('@/lib/subscription', () => ({ ensureRemnawaveSubscription: vi.fn() }))
vi.mock('@/lib/subscription-termination', () => ({
  terminateUserSubscription: mocks.terminateUserSubscription,
}))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/remnawave', () => ({ RemnawaveError: mocks.TestRemnawaveError }))

import { DELETE } from './route'

function request() {
  return new Request('https://cabinet.example/api/admin/users/user-1/plan', { method: 'DELETE' })
}

const context = { params: Promise.resolve({ id: 'user-1' }) }

describe('admin subscription deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1', role: 'ADMIN' })
    mocks.userFindUnique
      .mockResolvedValueOnce({ role: 'ADMIN' })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        role: 'USER',
        remnawaveUuid: 'uuid-1',
      })
    mocks.terminateUserSubscription.mockResolvedValue({ hadSubscription: true })
  })

  it('removes access and records the administrator action', async () => {
    const response = await DELETE(request(), context)

    expect(response.status).toBe(200)
    expect(mocks.terminateUserSubscription).toHaveBeenCalledWith({
      userId: 'user-1',
      source: 'ADMIN_REQUEST',
    })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'admin-1',
      targetId: 'user-1',
      action: 'ADMIN_SUBSCRIPTION_DELETED',
    }))
  })

  it('returns 502 when Remnawave does not remove the user', async () => {
    mocks.terminateUserSubscription.mockRejectedValue(
      new mocks.TestRemnawaveError(503, null)
    )

    const response = await DELETE(request(), context)
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.error).toContain('Remnawave')
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })
})
