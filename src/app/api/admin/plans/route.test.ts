import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const tx = {
    plan: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  }
  return {
    requireAdmin: vi.fn(),
    writeAuditLog: vi.fn(),
    tx,
    prisma: {
      plan: { findMany: vi.fn(), create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { POST } from './route'

function planRequest(overrides: Record<string, unknown> = {}) {
  return new Request('https://cabinet.example/api/admin/plans', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Основной',
      description: '  Популярный тариф  ',
      priceKopecks: 29900,
      durationDays: 30,
      trafficLimitGb: 100,
      deviceLimit: 5,
      activeInternalSquads: [],
      availability: 'ALL',
      allowedEmails: ['USER@example.com', 'user@example.com'],
      allowedTelegramIds: ['123'],
      isPromo: false,
      isFeatured: true,
      isActive: true,
      sortOrder: 10,
      ...overrides,
    }),
  })
}

describe('admin plans route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1', role: 'ADMIN' })
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx))
    mocks.tx.plan.create.mockResolvedValue({
      id: 'plan-1',
      name: 'Основной',
      priceKopecks: 29900,
      durationDays: 30,
      isActive: true,
      promoCodesEnabled: true,
      isFeatured: true,
    })
  })

  it('rejects a free non-promo plan before writing to the database', async () => {
    const response = await POST(planRequest({ priceKopecks: 0, isPromo: false }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Validation error')
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('atomically replaces the featured plan and normalizes access lists', async () => {
    const response = await POST(planRequest())

    expect(response.status).toBe(201)
    expect(mocks.tx.plan.updateMany).toHaveBeenCalledWith({
      where: { isFeatured: true },
      data: { isFeatured: false, featuredSlot: null },
    })
    expect(mocks.tx.plan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'Популярный тариф',
        allowedEmails: ['user@example.com'],
        allowedTelegramIds: ['123'],
        promoCodesEnabled: true,
        isFeatured: true,
        featuredSlot: 1,
      }),
    })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ADMIN_PLAN_CREATED',
      metadata: expect.objectContaining({ planId: 'plan-1', isFeatured: true }),
    }))
  })

  it('stores a tariff-level promo code restriction', async () => {
    const response = await POST(planRequest({ promoCodesEnabled: false, isFeatured: false }))

    expect(response.status).toBe(201)
    expect(mocks.tx.plan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ promoCodesEnabled: false }),
    })
  })
})
