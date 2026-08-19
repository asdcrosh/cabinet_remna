import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_RENEWAL_CONSENT_VERSION } from '@/lib/auto-renewal-consent'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  enableAutoRenewal: vi.fn(),
  disableAutoRenewal: vi.fn(),
  getAutoRenewalState: vi.fn(),
  isYookassaConfigured: vi.fn(),
  rateLimit: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}))
vi.mock('@/lib/auto-renewal', () => ({
  enableAutoRenewal: mocks.enableAutoRenewal,
  disableAutoRenewal: mocks.disableAutoRenewal,
  getAutoRenewalState: mocks.getAutoRenewalState,
}))
vi.mock('@/lib/yookassa', () => ({ isYookassaConfigured: mocks.isYookassaConfigured }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))

import { POST } from './route'

function request(body: unknown) {
  return new Request('https://cabinet.example/api/auto-renewal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('auto-renewal route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1', email: 'user@example.com', role: 'USER' })
    mocks.isYookassaConfigured.mockResolvedValue(true)
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.enableAutoRenewal.mockResolvedValue({ id: 'renewal-1' })
    mocks.getAutoRenewalState.mockResolvedValue({ id: 'renewal-1' })
  })

  it('does not enable recurring charges without explicit consent', async () => {
    const response = await POST(request({ planId: 'plan-1' }))
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error).toContain('Подтвердите согласие')
    expect(mocks.enableAutoRenewal).not.toHaveBeenCalled()
  })

  it('records the accepted consent version when enabling', async () => {
    const response = await POST(request({
      planId: 'plan-1',
      consentAccepted: true,
      consentVersion: AUTO_RENEWAL_CONSENT_VERSION,
    }))

    expect(response.status).toBe(200)
    expect(mocks.enableAutoRenewal).toHaveBeenCalledWith({
      userId: 'user-1',
      planId: 'plan-1',
      consentAccepted: true,
      consentVersion: AUTO_RENEWAL_CONSENT_VERSION,
    })
  })
})
