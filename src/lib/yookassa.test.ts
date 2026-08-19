import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.YOOKASSA_SHOP_ID = 'shop-id'
process.env.YOOKASSA_SECRET_KEY = 'secret-key'

vi.mock('./payment-settings', () => ({
  getResolvedPaymentProviderSettings: vi.fn(async () => ({
    yookassa: {
      enabled: true,
      shopId: 'shop-id',
      secretKey: 'secret-key',
      webhookAllowedIps: '',
    },
  })),
  isResolvedYooKassaConfigured: vi.fn(() => true),
}))

describe('yookassa client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('creates payment with amount, metadata and idempotence key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'yoo-1', status: 'pending', paid: false }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { createPayment } = await import('./yookassa')

    await createPayment({
      amount: 300,
      description: 'Подписка',
      returnUrl: 'https://cabinet.example/return',
      metadata: { localPaymentId: 'payment-1' },
      idempotenceKey: 'payment-1',
      paymentMethodType: 'sbp',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.yookassa.ru/v3/payments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotence-Key': 'payment-1',
          Authorization: `Basic ${Buffer.from('shop-id:secret-key').toString('base64')}`,
        }),
        body: JSON.stringify({
          amount: { value: '300.00', currency: 'RUB' },
          capture: true,
          confirmation: {
            type: 'redirect',
            return_url: 'https://cabinet.example/return',
          },
          description: 'Подписка',
          metadata: { localPaymentId: 'payment-1' },
          payment_method_data: { type: 'sbp' },
        }),
      })
    )
  })

  it('throws with response details when create payment fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'bad credentials',
    }))
    const { createPayment } = await import('./yookassa')

    await expect(createPayment({
      amount: 100,
      description: 'Подписка',
      returnUrl: 'https://cabinet.example/return',
      idempotenceKey: 'payment-2',
    })).rejects.toThrow('YooKassa createPayment failed: 401 bad credentials')
  })

  it('requests saving a bank card for future renewals', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'yoo-save', status: 'pending', paid: false }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { createPayment } = await import('./yookassa')

    await createPayment({
      amount: 300,
      description: 'Подписка',
      returnUrl: 'https://cabinet.example/return',
      idempotenceKey: 'payment-save',
      paymentMethodType: 'bank_card',
      savePaymentMethod: true,
    })

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const body = JSON.parse(String(request?.body))
    expect(body.save_payment_method).toBe(true)
    expect(body.payment_method_data).toEqual({ type: 'bank_card' })
    expect(body.confirmation).toEqual({
      type: 'redirect',
      return_url: 'https://cabinet.example/return',
    })
  })

  it('creates a recurring payment without redirect confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'yoo-repeat', status: 'pending', paid: false }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { createPayment } = await import('./yookassa')

    await createPayment({
      amount: 300,
      description: 'Продление подписки',
      returnUrl: 'https://cabinet.example/return',
      idempotenceKey: 'payment-repeat',
      paymentMethodId: 'pm-saved-1',
    })

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const body = JSON.parse(String(request?.body))
    expect(body.payment_method_id).toBe('pm-saved-1')
    expect(body.confirmation).toBeUndefined()
    expect(body.payment_method_data).toBeUndefined()
  })
})
