import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    plan: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))

import { GET } from './route'

describe('public plans route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.plan.findMany.mockResolvedValue([])
  })

  it('returns only active public plans and safe fields', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(mocks.prisma.plan.findMany).toHaveBeenCalledWith({
      where: { isActive: true, availability: 'ALL' },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        priceKopecks: true,
        durationDays: true,
        trafficLimitGb: true,
        deviceLimit: true,
        isPromo: true,
        promoCodesEnabled: true,
        isFeatured: true,
        sortOrder: true,
      },
    })
  })
})
