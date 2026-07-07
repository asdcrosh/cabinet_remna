import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  writeAuditLog: vi.fn(),
  prisma: {
    plan: { findFirst: vi.fn() },
    promoCode: { findFirst: vi.fn() },
    welcomeBonusSetting: { upsert: vi.fn() },
  },
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { PATCH } from './route'

function welcomeBonusRequest(body: unknown) {
  return new Request('https://cabinet.example/api/admin/welcome-bonus', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

describe('admin welcome bonus route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1', email: 'admin@example.com', role: 'ADMIN' })
    mocks.prisma.promoCode.findFirst.mockResolvedValue({ id: 'promo-1' })
    mocks.prisma.welcomeBonusSetting.upsert.mockResolvedValue({ id: 'default' })
  })

  it('saves a manually created promo code as welcome bonus', async () => {
    const response = await PATCH(welcomeBonusRequest({
      enabled: true,
      promoCodeEnabled: true,
      promoCodeId: 'promo-1',
    }))

    expect(response.status).toBe(200)
    expect(mocks.prisma.promoCode.findFirst).toHaveBeenCalledWith({
      where: { id: 'promo-1', isActive: true, bonusBoxOpenings: { none: {} } },
      select: { id: true },
    })
    expect(mocks.prisma.welcomeBonusSetting.upsert).toHaveBeenCalledWith({
      where: { id: 'default' },
      create: expect.objectContaining({
        id: 'default',
        type: 'PROMO_CODE',
        promoCodeId: 'promo-1',
      }),
      update: expect.objectContaining({
        type: 'PROMO_CODE',
        promoCodeId: 'promo-1',
      }),
    })
  })

  it('rejects bonus-box promo codes', async () => {
    mocks.prisma.promoCode.findFirst.mockResolvedValue(null)

    const response = await PATCH(welcomeBonusRequest({
      enabled: true,
      promoCodeEnabled: true,
      promoCodeId: 'box-promo-1',
    }))
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error).toBe('Выберите активный промокод, созданный вручную')
    expect(mocks.prisma.welcomeBonusSetting.upsert).not.toHaveBeenCalled()
  })
})
