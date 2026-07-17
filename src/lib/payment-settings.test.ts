import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptPaymentSecret } from './payment-settings-crypto'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    paymentProviderSetting: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
      deleteMany: mocks.deleteMany,
    },
  },
}))

import {
  getPublicPaymentProviderSettings,
  resetPaymentProviderSettings,
  updatePaymentProviderSettings,
} from './payment-settings'

let stored: Record<string, unknown> | null

describe('payment provider settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.JWT_SECRET = 'test-payment-settings-secret-at-least-32-characters'
    process.env.YOOKASSA_ENABLED = 'true'
    process.env.YOOKASSA_SHOP_ID = 'env-shop'
    process.env.YOOKASSA_SECRET_KEY = 'env-secret'
    process.env.YOOKASSA_WEBHOOK_ALLOWED_IPS = '127.0.0.1'
    process.env.PAYANYWAY_ENABLED = 'false'
    process.env.PAYANYWAY_MNT_ID = '49907299'
    process.env.PAYANYWAY_INTEGRITY_CODE = 'e'.repeat(64)
    stored = null
    mocks.findUnique.mockImplementation(async () => stored)
    mocks.upsert.mockImplementation(async ({ create, update }) => {
      stored = stored ? { ...stored, ...update } : create
      return stored
    })
    mocks.deleteMany.mockImplementation(async () => {
      stored = null
      return { count: 1 }
    })
  })

  it('uses .env until an admin override is saved', async () => {
    await expect(getPublicPaymentProviderSettings()).resolves.toEqual(expect.objectContaining({
      source: 'environment',
      yookassa: expect.objectContaining({ enabled: true, shopId: 'env-shop', configured: true }),
      payAnyWay: expect.objectContaining({ enabled: false, merchantId: '49907299' }),
    }))
  })

  it('encrypts new secrets and never returns them to the admin client', async () => {
    const result = await updatePaymentProviderSettings({
      yookassa: {
        enabled: false,
        shopId: 'db-shop',
        secretKey: 'db-yookassa-secret',
        webhookAllowedIps: '10.0.0.0/8',
      },
      payAnyWay: {
        enabled: true,
        merchantId: '12345678',
        integrityCode: 'p'.repeat(64),
        testMode: true,
      },
    })

    expect(stored?.yookassaSecretKeyEncrypted).not.toBe('db-yookassa-secret')
    expect(decryptPaymentSecret(String(stored?.yookassaSecretKeyEncrypted))).toBe('db-yookassa-secret')
    expect(decryptPaymentSecret(String(stored?.payAnyWayIntegrityCodeEncrypted))).toBe('p'.repeat(64))
    expect(result).toEqual(expect.objectContaining({
      source: 'database',
      yookassa: expect.objectContaining({ enabled: false, secretConfigured: true }),
      payAnyWay: expect.objectContaining({ enabled: true, configured: true, integrityCodeConfigured: true }),
    }))
    expect(JSON.stringify(result)).not.toContain('db-yookassa-secret')
    expect(JSON.stringify(result)).not.toContain('p'.repeat(64))
  })

  it('returns to .env settings after reset', async () => {
    stored = { id: 'default', yookassaEnabled: false }
    const result = await resetPaymentProviderSettings()

    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: 'default' } })
    expect(result.source).toBe('environment')
    expect(result.yookassa.enabled).toBe(true)
  })
})
