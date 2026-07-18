import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findFirst: vi.fn(),
  createPayAnyWayPaymentRequest: vi.fn(),
  logInfo: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { payment: { findFirst: mocks.findFirst } },
}))
vi.mock('@/lib/payanyway', () => ({
  createPayAnyWayPaymentRequest: mocks.createPayAnyWayPaymentRequest,
}))
vi.mock('@/lib/logger', () => ({ logInfo: mocks.logInfo }))

import { GET } from './route'

describe('PayAnyWay payment form redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.APP_URL = 'https://cabinet.example'
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1', email: 'user@example.com', role: 'USER' })
    mocks.findFirst.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      amountKopecks: 30000,
      plan: { name: 'Стандарт', durationDays: 30 },
    })
    mocks.createPayAnyWayPaymentRequest.mockResolvedValue({
      action: 'https://www.payanyway.ru/assistant.htm',
      fields: {
        MNT_ID: '49907299',
        MNT_TRANSACTION_ID: 'payment-1',
        MNT_AMOUNT: '300.00',
        MNT_CURRENCY_CODE: 'RUB',
        MNT_SUBSCRIBER_ID: 'user@example.com',
        MNT_TEST_MODE: '0',
        MNT_SIGNATURE: '0123456789abcdef0123456789abcdef',
      },
      diagnostics: {
        source: 'environment',
        secretLength: 32,
        secretFingerprint: 'secret-fp-12',
        payloadFingerprint: 'payload-fp12',
      },
    })
  })

  it('submits the signed payment fields as a protected POST form', async () => {
    const response = await GET(new Request(
      'https://cabinet.example/api/payment/payanyway/redirect?payment=payment-1'
    ))
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('content-security-policy')).toContain(
      'form-action https://www.payanyway.ru'
    )
    expect(html).toContain('method="post"')
    expect(html).toContain('action="https://www.payanyway.ru/assistant.htm"')
    expect(html).toContain('name="MNT_TRANSACTION_ID" value="payment-1"')
    expect(html).toContain('name="MNT_SUBSCRIBER_ID" value="user@example.com"')
    expect(html).toContain('name="MNT_TEST_MODE" value="0"')
    expect(html).toContain(
      'name="MNT_SIGNATURE" value="0123456789abcdef0123456789abcdef"'
    )
    expect(mocks.createPayAnyWayPaymentRequest).toHaveBeenCalledWith({
      transactionId: 'payment-1',
      amountKopecks: 30000,
      description: 'Подписка: Стандарт (30 дн.)',
      subscriberId: 'user@example.com',
      successUrl: 'https://cabinet.example/dashboard/billing?paid=1&payment=payment-1',
      failUrl: 'https://cabinet.example/dashboard/billing?payment=payment-1&failed=1',
      returnUrl: 'https://cabinet.example/dashboard/billing?payment=payment-1',
    })
    expect(mocks.logInfo).toHaveBeenCalledWith('payment.payanyway.form_prepared', {
      paymentId: 'payment-1',
      merchantId: '49907299',
      amount: '300.00',
      subscriberType: 'email',
      testMode: '0',
      configSource: 'environment',
      integrityLength: 32,
      integrityFingerprint: 'secret-fp-12',
      payloadFingerprint: 'payload-fp12',
      submissionMethod: 'POST',
    })
  })

  it('does not expose another user payment', async () => {
    mocks.findFirst.mockResolvedValue(null)

    const response = await GET(new Request(
      'https://cabinet.example/api/payment/payanyway/redirect?payment=payment-2'
    ))

    expect(response.status).toBe(404)
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'payment-2',
        userId: 'user-1',
        provider: 'PAYANYWAY',
        status: 'PENDING',
      },
      include: { plan: { select: { name: true, durationDays: true } } },
    })
    expect(mocks.createPayAnyWayPaymentRequest).not.toHaveBeenCalled()
  })
})
