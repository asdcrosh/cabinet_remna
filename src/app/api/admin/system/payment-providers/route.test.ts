import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  resetSettings: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/payment-settings', () => ({
  getPublicPaymentProviderSettings: mocks.getSettings,
  updatePaymentProviderSettings: mocks.updateSettings,
  resetPaymentProviderSettings: mocks.resetSettings,
}))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { DELETE, GET, PATCH } from './route'

const publicSettings = {
  source: 'database',
  yookassa: {
    enabled: true,
    configured: true,
    shopId: 'shop-1',
    secretConfigured: true,
    webhookAllowedIps: '127.0.0.1',
  },
  payAnyWay: {
    enabled: false,
    configured: false,
    merchantId: '',
    integrityCodeConfigured: false,
    testMode: false,
  },
}

describe('admin payment provider settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1' })
    mocks.getSettings.mockResolvedValue(publicSettings)
    mocks.updateSettings.mockResolvedValue(publicSettings)
    mocks.resetSettings.mockResolvedValue({ ...publicSettings, source: 'environment' })
  })

  it('returns settings without secrets', async () => {
    const response = await GET()
    await expect(response.json()).resolves.toEqual({ settings: publicSettings })
    expect(JSON.stringify(await mocks.getSettings.mock.results[0]?.value)).not.toContain('secret-key')
  })

  it('saves credentials and audits only the public result', async () => {
    const input = {
      yookassa: { enabled: true, shopId: 'shop-1', secretKey: 'secret-key', webhookAllowedIps: '127.0.0.1' },
      payAnyWay: { enabled: true, merchantId: '49907299', integrityCode: 'a'.repeat(64), testMode: false },
    }
    const request = new Request('https://cabinet.example/api/admin/system/payment-providers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const response = await PATCH(request)

    expect(response.status).toBe(200)
    expect(mocks.updateSettings).toHaveBeenCalledWith(input)
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ADMIN_PAYMENT_PROVIDERS_UPDATED',
      metadata: publicSettings,
    }))
  })

  it('rejects a short PayAnyWay integrity code', async () => {
    const request = new Request('https://cabinet.example/api/admin/system/payment-providers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yookassa: { enabled: false, shopId: '', webhookAllowedIps: '' },
        payAnyWay: { enabled: true, merchantId: '49907299', integrityCode: 'short', testMode: false },
      }),
    })
    const response = await PATCH(request)

    expect(response.status).toBe(422)
    expect(mocks.updateSettings).not.toHaveBeenCalled()
  })

  it('resets database overrides to .env', async () => {
    const request = new Request('https://cabinet.example/api/admin/system/payment-providers', { method: 'DELETE' })
    const response = await DELETE(request)

    expect(response.status).toBe(200)
    expect(mocks.resetSettings).toHaveBeenCalled()
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ADMIN_PAYMENT_PROVIDERS_RESET',
    }))
  })
})
