import { describe, expect, it } from 'vitest'
import { buildPaymentServiceName } from './payment-service-name'

describe('payment service name', () => {
  it('uses neutral fiscal wording', () => {
    const name = buildPaymentServiceName(30)

    expect(name).toBe('Доступ к цифровому сервису на 30 дн.')
    expect(name).not.toMatch(/vpn/i)
  })

  it('rejects an invalid duration', () => {
    expect(() => buildPaymentServiceName(0)).toThrow('positive integer')
  })
})
