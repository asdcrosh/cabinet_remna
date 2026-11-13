import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn(), findPayment: vi.fn(), status: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found') }, redirect: () => { throw new Error('redirect') } }))
vi.mock('@/lib/auth/cookies', () => ({ getCurrentUser: mocks.session }))
vi.mock('@/lib/prisma', () => ({ prisma: { payment: { findFirst: mocks.findPayment } } }))
vi.mock('@/lib/payment-status-read', () => ({ readPaymentBannerStatus: mocks.status }))
vi.mock('@/components/dashboard/payment-success-banner', () => ({ PaymentSuccessBanner: () => null }))

import PaymentReceiptPage from './page'

describe('YooKassa receipt access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.mockResolvedValue({ uid: 'owner-1' })
    mocks.status.mockResolvedValue('awaiting')
  })

  it('loads a receipt only for the signed-in owner and YooKassa', async () => {
    mocks.findPayment.mockResolvedValue({ id: 'payment-1', amountKopecks: 29900,
      confirmationUrl: 'https://yookassa.example/pay', status: 'PENDING', createdAt: new Date(), plan: { name: 'Стандарт' } })
    await PaymentReceiptPage({ searchParams: Promise.resolve({ payment: 'payment-1' }) })
    expect(mocks.findPayment).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'payment-1', userId: 'owner-1', provider: 'YOOKASSA' },
    }))
    expect(mocks.status).toHaveBeenCalledWith('payment-1', 'owner-1')
  })

  it('rejects an absent or foreign receipt', async () => {
    mocks.findPayment.mockResolvedValue(null)
    await expect(PaymentReceiptPage({ searchParams: Promise.resolve({ payment: 'other-payment' }) })).rejects.toThrow('not-found')
    expect(mocks.findPayment).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'other-payment', userId: 'owner-1', provider: 'YOOKASSA' },
    }))
  })
})
