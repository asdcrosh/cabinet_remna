import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  upsert: vi.fn(),
  logWarn: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: { paymentEvent: { create: mocks.create, upsert: mocks.upsert } },
}))
vi.mock('./logger', () => ({ logWarn: mocks.logWarn }))

import { recordPaymentEvent } from './payment-events'

describe('recordPaymentEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.upsert.mockResolvedValue({ id: 'event-1' })
    mocks.create.mockResolvedValue({ id: 'event-1' })
  })

  it('stores an idempotent event and redacts sensitive details', async () => {
    await recordPaymentEvent({
      paymentId: 'payment-1',
      stage: 'PROVIDER',
      status: 'ERROR',
      source: 'test',
      message: 'Provider failed',
      details: { apiToken: 'secret', statusCode: 502 },
      dedupeKey: 'provider-failed',
    })

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { dedupeKey: 'payment-1:provider-failed' },
      create: expect.objectContaining({
        details: { apiToken: '[REDACTED]', statusCode: 502 },
      }),
      update: expect.objectContaining({ attempts: { increment: 1 } }),
    }))
  })

  it('never interrupts a payment when the diagnostic write fails', async () => {
    mocks.create.mockRejectedValue(new Error('database unavailable'))

    await expect(recordPaymentEvent({
      paymentId: 'payment-1',
      stage: 'PAYMENT',
      source: 'test',
      message: 'Payment checked',
    })).resolves.toBeNull()

    expect(mocks.logWarn).toHaveBeenCalledOnce()
  })
})
