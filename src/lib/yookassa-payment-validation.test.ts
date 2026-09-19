import { describe, expect, it } from 'vitest'
import { validateYooKassaPayment } from './yookassa-payment-validation'

const local = { id: 'pay-1', userId: 'user-1', planId: 'plan-1', amountKopecks: 59900 }
const remote = {
  id: 'yoo-1',
  status: 'succeeded' as const,
  paid: true,
  amount: { value: '599.00', currency: 'RUB' },
  metadata: { localPaymentId: 'pay-1', userId: 'user-1', planId: 'plan-1' },
  created_at: '2026-09-18T00:00:00.000Z',
}

describe('validateYooKassaPayment', () => {
  it('accepts the exact local order', () => {
    expect(() => validateYooKassaPayment(local, remote, 'yoo-1')).not.toThrow()
  })

  it.each([
    [{ ...remote, id: 'yoo-other' }, 'different payment id'],
    [{ ...remote, amount: { value: '598.00', currency: 'RUB' } }, 'different amount'],
    [{ ...remote, amount: { value: '599.00', currency: 'USD' } }, 'different currency'],
    [{ ...remote, metadata: { ...remote.metadata, localPaymentId: 'pay-other' } }, 'different payment'],
    [{ ...remote, metadata: { ...remote.metadata, userId: 'user-other' } }, 'different user'],
    [{ ...remote, metadata: { ...remote.metadata, planId: 'plan-other' } }, 'different plan'],
    [{ ...remote, paid: false }, 'not marked paid'],
  ])('rejects mismatched provider data: %s', (value, message) => {
    expect(() => validateYooKassaPayment(local, value, 'yoo-1'))
      .toThrow(message)
  })
})
