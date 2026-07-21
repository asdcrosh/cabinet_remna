import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./payment-settings', () => ({
  getResolvedPaymentProviderSettings: vi.fn(async () => ({
    platega: {
      enabled: true,
      merchantId: 'merchant-id',
      secret: 'platega-secret',
    },
  })),
  isResolvedPlategaConfigured: vi.fn(() => true),
}))

import {
  createPlategaPayment,
  getPlategaTransaction,
  verifyPlategaCallbackHeaders,
} from './platega'

describe('Platega integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a hosted checkout with immutable payment metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        transactionId: 'transaction-1',
        status: 'PENDING',
        url: 'https://pay.platega.io/?id=transaction-1',
        expiresIn: '00:15:00',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await createPlategaPayment({
      amountKopecks: 30000,
      description: 'Доступ на 30 дней',
      returnUrl: 'https://cabinet.example/dashboard/billing?paid=1',
      failedUrl: 'https://cabinet.example/dashboard/billing?paid=1',
      payload: 'payment-1',
      metadata: { userId: 'user-1', userName: 'user@example.com' },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.platega.io/v2/transaction/process',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-MerchantId': 'merchant-id',
          'X-Secret': 'platega-secret',
        }),
        body: JSON.stringify({
          paymentDetails: { amount: 300, currency: 'RUB' },
          description: 'Доступ на 30 дней',
          return: 'https://cabinet.example/dashboard/billing?paid=1',
          failedUrl: 'https://cabinet.example/dashboard/billing?paid=1',
          payload: 'payment-1',
          metadata: { userId: 'user-1', userName: 'user@example.com' },
        }),
      })
    )
    expect(result).toEqual({
      transactionId: 'transaction-1',
      status: 'PENDING',
      url: 'https://pay.platega.io/?id=transaction-1',
      expiresIn: '00:15:00',
    })
  })

  it('reads and normalizes a transaction status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        id: 'transaction-1',
        status: 'CONFIRMED',
        paymentDetails: { amount: 300, currency: 'rub' },
        paymentMethod: 'SBPQR',
        expiresIn: '00:00:00',
        payload: 'payment-1',
      }),
    }))

    await expect(getPlategaTransaction('transaction-1')).resolves.toEqual({
      id: 'transaction-1',
      status: 'CONFIRMED',
      paymentDetails: { amount: 300, currency: 'RUB' },
      paymentMethod: 'SBPQR',
      expiresIn: '00:00:00',
      payload: 'payment-1',
    })
  })

  it('rejects an insecure checkout URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        transactionId: 'transaction-1',
        status: 'PENDING',
        url: 'http://pay.example/transaction-1',
      }),
    }))

    await expect(createPlategaPayment({
      amountKopecks: 10000,
      description: 'Доступ',
      returnUrl: 'https://cabinet.example/return',
      failedUrl: 'https://cabinet.example/fail',
      payload: 'payment-1',
      metadata: { userId: 'user-1', userName: 'user@example.com' },
    })).rejects.toThrow('insecure url')
  })

  it('accepts callback headers only with exact merchant credentials', async () => {
    const request = new Request('https://cabinet.example/api/webhook/platega', {
      headers: {
        'X-MerchantId': 'merchant-id',
        'X-Secret': 'platega-secret',
      },
    })
    await expect(verifyPlategaCallbackHeaders(request)).resolves.toEqual({ ok: true })

    const invalid = new Request('https://cabinet.example/api/webhook/platega', {
      headers: {
        'X-MerchantId': 'merchant-id',
        'X-Secret': 'wrong-secret',
      },
    })
    await expect(verifyPlategaCallbackHeaders(invalid)).resolves.toEqual({
      ok: false,
      error: 'invalid_credentials',
    })
  })
})
