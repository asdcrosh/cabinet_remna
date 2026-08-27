import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  writeAuditLog: vi.fn(),
  attachRemnashopIdentityToCabinetUser: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/telegram-link-sync', () => ({
  attachRemnashopIdentityToCabinetUser: mocks.attachRemnashopIdentityToCabinetUser,
}))

import { PATCH } from './route'

const target = {
  id: 'user-1',
  role: 'USER',
  email: 'user@example.com',
  telegramId: null,
  personalDiscountPercent: 0,
  nextPurchaseDiscountPercent: 0,
}

function request(discounts: Record<string, number>) {
  return new Request('http://localhost/api/admin/users/user-1/profile', {
    method: 'PATCH',
    body: JSON.stringify({
      email: target.email,
      name: 'Пользователь',
      emailVerified: true,
      telegramId: '',
      telegramUsername: '',
      remnashopUserId: '',
      ...discounts,
    }),
  })
}

describe('admin user profile discounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (
      where.id === 'actor-1' ? { role: 'SUPER_ADMIN' } : target
    ))
    mocks.userUpdate.mockResolvedValue({
      ...target,
      name: 'Пользователь',
      emailVerifiedAt: new Date('2026-08-27T00:00:00.000Z'),
      telegramUsername: null,
      remnashopUserId: null,
      personalDiscountPercent: 15,
      nextPurchaseDiscountPercent: 25,
    })
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback({
      user: { update: mocks.userUpdate },
      emailVerificationToken: { deleteMany: vi.fn() },
      passwordResetToken: { deleteMany: vi.fn() },
    }))
    mocks.writeAuditLog.mockResolvedValue(undefined)
  })

  it('allows a super admin to assign both discounts', async () => {
    mocks.requireAdmin.mockResolvedValue({ uid: 'actor-1' })

    const response = await PATCH(request({
      personalDiscountPercent: 15,
      nextPurchaseDiscountPercent: 25,
    }), { params: Promise.resolve({ id: target.id }) })

    expect(response.status).toBe(200)
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        personalDiscountPercent: 15,
        nextPurchaseDiscountPercent: 25,
      }),
    }))
  })

  it('rejects discount changes from a regular admin', async () => {
    mocks.requireAdmin.mockResolvedValue({ uid: 'actor-1' })
    mocks.prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (
      where.id === 'actor-1' ? { role: 'ADMIN' } : target
    ))

    const response = await PATCH(request({ personalDiscountPercent: 15 }), {
      params: Promise.resolve({ id: target.id }),
    })

    expect(response.status).toBe(403)
    expect(mocks.userUpdate).not.toHaveBeenCalled()
  })
})
