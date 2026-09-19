import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  paymentFindMany: vi.fn(),
  provisioningJobFindMany: vi.fn(),
  syncPaymentProvisioning: vi.fn(),
}))

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    payment: { findMany: mocks.paymentFindMany },
    provisioningJob: { findMany: mocks.provisioningJobFindMany },
    $disconnect: vi.fn(),
  },
}))
vi.mock('../src/lib/payment-sync', () => ({
  syncPaymentProvisioning: mocks.syncPaymentProvisioning,
}))
vi.mock('../src/lib/logger', () => ({ logInfo: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }))

import { runPriorityPaymentQueues } from './payment-reconciler'

describe('payment reconciler priority queues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.provisioningJobFindMany.mockResolvedValue([])
    mocks.syncPaymentProvisioning.mockResolvedValue({ ok: true, status: 'pending', provisioned: false })
  })

  it('processes a new confirmed payment before a backlog of 100 pending payments', async () => {
    const pendingBacklog = Array.from({ length: 100 }, (_, index) => ({
      id: `pending-${index}`,
      status: 'PENDING',
      provider: 'YOOKASSA',
      yookassaId: `yoo-${index}`,
    }))
    mocks.paymentFindMany.mockImplementation(async (args) => {
      if (args.where.status === 'SUCCEEDED') {
        return [{ id: 'new-paid', status: 'SUCCEEDED', provider: 'YOOKASSA', yookassaId: 'yoo-paid' }]
      }
      return pendingBacklog.slice(0, args.take)
    })

    await runPriorityPaymentQueues()

    expect(mocks.syncPaymentProvisioning).toHaveBeenCalledTimes(26)
    expect(mocks.syncPaymentProvisioning.mock.calls.at(0)![0]).toMatchObject({ paymentId: 'new-paid' })
    expect(mocks.syncPaymentProvisioning.mock.calls.slice(1).map(([input]) => input.paymentId))
      .toEqual(pendingBacklog.slice(0, 25).map((payment) => payment.id))
  })

  it('keeps future failed provisioning jobs out of both immediate queues', async () => {
    mocks.paymentFindMany.mockResolvedValue([])

    await runPriorityPaymentQueues()

    expect(mocks.paymentFindMany.mock.calls.at(0)![0].where.OR).not.toContainEqual(
      expect.objectContaining({ provisioningJob: expect.objectContaining({ status: 'FAILED' }) })
    )
    expect(mocks.provisioningJobFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'FAILED',
        OR: expect.arrayContaining([{ nextRetryAt: null }]),
      }),
    }))
  })
})
