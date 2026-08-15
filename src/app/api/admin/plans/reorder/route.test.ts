import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const tx = {
    plan: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  }
  return {
    requireAdmin: vi.fn(),
    writeAuditLog: vi.fn(),
    tx,
    prisma: { $transaction: vi.fn() },
  }
})

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { PATCH } from './route'

function request(planIds: unknown) {
  return new Request('https://cabinet.example/api/admin/plans/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ planIds }),
  })
}

describe('plan catalog reorder route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1', role: 'ADMIN' })
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx))
    mocks.tx.plan.findMany.mockResolvedValue([{ id: 'plan-a' }, { id: 'plan-b' }, { id: 'plan-c' }])
    mocks.tx.plan.update.mockResolvedValue({})
  })

  it('persists every plan in the submitted order', async () => {
    const response = await PATCH(request(['plan-c', 'plan-a', 'plan-b']))

    expect(response.status).toBe(200)
    expect(mocks.tx.plan.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'plan-c' },
      data: { sortOrder: 10 },
    })
    expect(mocks.tx.plan.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'plan-a' },
      data: { sortOrder: 20 },
    })
    expect(mocks.tx.plan.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'plan-b' },
      data: { sortOrder: 30 },
    })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ADMIN_PLAN_UPDATED',
      metadata: expect.objectContaining({ planIds: ['plan-c', 'plan-a', 'plan-b'] }),
    }))
  })

  it('rejects a partial order instead of moving omitted plans unexpectedly', async () => {
    const response = await PATCH(request(['plan-a', 'plan-b']))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toContain('изменился')
    expect(mocks.tx.plan.update).not.toHaveBeenCalled()
  })
})
