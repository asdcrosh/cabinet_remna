import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  paymentFindUnique: vi.fn(),
  eventFindMany: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (...args: never[]) => unknown) => handler,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    payment: { findUnique: mocks.paymentFindUnique },
    paymentEvent: { findMany: mocks.eventFindMany },
  },
}))

import { GET } from './route'

describe('admin payment events route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads a bounded timeline only for an existing payment', async () => {
    mocks.paymentFindUnique.mockResolvedValue({ id: 'payment-1' })
    mocks.eventFindMany.mockResolvedValue([{
      id: 'event-1', paymentId: 'payment-1', stage: 'PAYMENT', status: 'SUCCESS',
      source: 'test', message: 'Оплата подтверждена', details: null, attempts: 1,
      createdAt: new Date('2026-09-19T10:00:00.000Z'),
      updatedAt: new Date('2026-09-19T10:01:00.000Z'),
    }])

    const response = await GET(new Request('https://cabinet.example/api/admin/payments/payment-1/events'), {
      params: Promise.resolve({ id: 'payment-1' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.requireAdmin).toHaveBeenCalled()
    expect(mocks.eventFindMany).toHaveBeenCalledWith({
      where: { paymentId: 'payment-1' }, orderBy: { updatedAt: 'desc' }, take: 100,
    })
    await expect(response.json()).resolves.toMatchObject({
      events: [{ id: 'event-1', createdAt: '2026-09-19T10:00:00.000Z' }],
    })
  })

  it('does not query events for an unknown payment', async () => {
    mocks.paymentFindUnique.mockResolvedValue(null)
    const response = await GET(new Request('https://cabinet.example/api/admin/payments/missing/events'), {
      params: Promise.resolve({ id: 'missing' }),
    })
    expect(response.status).toBe(404)
    expect(mocks.eventFindMany).not.toHaveBeenCalled()
  })
})
