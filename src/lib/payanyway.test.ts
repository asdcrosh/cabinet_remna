import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPayAnyWayPaymentRequest,
  parsePayAnyWayCallback,
  verifyPayAnyWayCallback,
} from './payanyway'

vi.mock('./payment-settings', () => ({
  getResolvedPaymentProviderSettings: vi.fn(async () => ({
    source: 'environment',
    payAnyWay: {
      enabled: true,
      merchantId: '49907299',
      integrityCode: 'a'.repeat(64),
      testMode: false,
      paymentUrl: '',
    },
  })),
  isResolvedPayAnyWayConfigured: vi.fn(() => true),
}))

const integrityCode = 'a'.repeat(64)

describe('PayAnyWay integration', () => {
  beforeEach(() => {
    process.env.PAYANYWAY_ENABLED = 'true'
    process.env.PAYANYWAY_MNT_ID = '49907299'
    process.env.PAYANYWAY_INTEGRITY_CODE = integrityCode
    process.env.PAYANYWAY_TEST_MODE = 'false'
    delete process.env.PAYANYWAY_PAYMENT_URL
  })

  it('creates CMS-compatible signed fields with an immutable amount', async () => {
    const request = await createPayAnyWayPaymentRequest({
      transactionId: 'payment-1',
      amountKopecks: 13000,
      description: 'Стандарт 7 дней',
      subscriberId: 'user@example.com',
      successUrl: 'https://cabinet.example/dashboard/billing?paid=1',
      failUrl: 'https://cabinet.example/dashboard/billing?failed=1',
      returnUrl: 'https://cabinet.example/dashboard/billing',
    })

    expect(request.action).toBe('https://payanyway.ru/assistant.htm')
    expect(request.fields.MNT_AMOUNT).toBe('130.00')
    expect(request.fields.MNT_CURRENCY_CODE).toBe('RUB')
    expect(request.fields.MNT_TRANSACTION_ID).toBe('payment-1')
    expect(request.fields.MNT_TEST_MODE).toBe('0')
    expect(request.fields.MNT_SUBSCRIBER_ID).toBe('user@example.com')
    expect(request.fields.MNT_SIGNATURE).toBe(
      md5(`49907299payment-1130.00RUBuser@example.com0${integrityCode}`)
    )
    expect(request.diagnostics).toMatchObject({ source: 'environment', secretLength: 64 })
  })

  it('rejects an empty CMS subscriber ID', async () => {
    await expect(createPayAnyWayPaymentRequest({
      transactionId: 'payment-2',
      amountKopecks: 30000,
      description: 'Стандарт 30 дней',
      subscriberId: ' ',
      successUrl: 'https://cabinet.example/dashboard/billing?paid=1',
      failUrl: 'https://cabinet.example/dashboard/billing?failed=1',
      returnUrl: 'https://cabinet.example/dashboard/billing',
    })).rejects.toThrow('PayAnyWay subscriber ID is required')
  })

  it('accepts only a callback with the exact provider signature', async () => {
    const amount = '130.00'
    const signature = md5(`49907299payment-1operation-1${amount}RUBuser@example.com0${integrityCode}`)
    const callback = parsePayAnyWayCallback(new URLSearchParams({
      MNT_ID: '49907299',
      MNT_TRANSACTION_ID: 'payment-1',
      MNT_OPERATION_ID: 'operation-1',
      MNT_AMOUNT: amount,
      MNT_CURRENCY_CODE: 'RUB',
      MNT_SUBSCRIBER_ID: 'user@example.com',
      MNT_TEST_MODE: '0',
      MNT_SIGNATURE: signature,
    }))

    expect(callback).not.toBeNull()
    await expect(verifyPayAnyWayCallback(callback!)).resolves.toEqual({ ok: true, amountKopecks: 13000 })
    await expect(verifyPayAnyWayCallback({ ...callback!, signature: '0'.repeat(32) })).resolves.toEqual({
      ok: false,
      error: 'invalid_signature',
    })
  })
})

function md5(value: string) {
  return createHash('md5').update(value).digest('hex')
}
