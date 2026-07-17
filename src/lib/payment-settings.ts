import { prisma } from './prisma'
import { decryptPaymentSecret, encryptPaymentSecret } from './payment-settings-crypto'
import { logWarn } from './logger'

export type PaymentProviderSettingsInput = {
  yookassa: {
    enabled: boolean
    shopId: string
    secretKey?: string
    webhookAllowedIps: string
  }
  payAnyWay: {
    enabled: boolean
    merchantId: string
    integrityCode?: string
    testMode: boolean
  }
}

export type PublicPaymentProviderSettings = {
  source: 'environment' | 'database'
  yookassa: {
    enabled: boolean
    configured: boolean
    shopId: string
    secretConfigured: boolean
    webhookAllowedIps: string
  }
  payAnyWay: {
    enabled: boolean
    configured: boolean
    merchantId: string
    integrityCodeConfigured: boolean
    testMode: boolean
  }
}

export type ResolvedPaymentProviderSettings = {
  source: 'environment' | 'database'
  yookassa: {
    enabled: boolean
    shopId: string
    secretKey: string
    webhookAllowedIps: string
  }
  payAnyWay: {
    enabled: boolean
    merchantId: string
    integrityCode: string
    testMode: boolean
    paymentUrl: string
  }
}

export async function getResolvedPaymentProviderSettings(): Promise<ResolvedPaymentProviderSettings> {
  const setting = await prisma.paymentProviderSetting.findUnique({ where: { id: 'default' } })
  const yookassaSecretKey = setting?.yookassaSecretKeyEncrypted
    ? decryptStoredSecret(setting.yookassaSecretKeyEncrypted, 'yookassa')
    : env('YOOKASSA_SECRET_KEY')
  const payAnyWayIntegrityCode = setting?.payAnyWayIntegrityCodeEncrypted
    ? decryptStoredSecret(setting.payAnyWayIntegrityCodeEncrypted, 'payanyway')
    : env('PAYANYWAY_INTEGRITY_CODE')

  return {
    source: setting ? 'database' : 'environment',
    yookassa: {
      enabled: setting?.yookassaEnabled ?? envFlag('YOOKASSA_ENABLED', true),
      shopId: setting?.yookassaShopId?.trim() || env('YOOKASSA_SHOP_ID'),
      secretKey: yookassaSecretKey,
      webhookAllowedIps: setting?.yookassaWebhookAllowedIps?.trim() || env('YOOKASSA_WEBHOOK_ALLOWED_IPS'),
    },
    payAnyWay: {
      enabled: setting?.payAnyWayEnabled ?? envFlag('PAYANYWAY_ENABLED', false),
      merchantId: setting?.payAnyWayMerchantId?.trim() || env('PAYANYWAY_MNT_ID'),
      integrityCode: payAnyWayIntegrityCode,
      testMode: setting?.payAnyWayTestMode ?? envFlag('PAYANYWAY_TEST_MODE', false),
      paymentUrl: env('PAYANYWAY_PAYMENT_URL'),
    },
  }
}

export async function getPublicPaymentProviderSettings(): Promise<PublicPaymentProviderSettings> {
  return toPublicSettings(await getResolvedPaymentProviderSettings())
}

export async function updatePaymentProviderSettings(input: PaymentProviderSettingsInput) {
  const current = await prisma.paymentProviderSetting.findUnique({ where: { id: 'default' } })
  const data = {
    yookassaEnabled: input.yookassa.enabled,
    yookassaShopId: clean(input.yookassa.shopId),
    yookassaSecretKeyEncrypted: input.yookassa.secretKey?.trim()
      ? encryptPaymentSecret(input.yookassa.secretKey.trim())
      : current?.yookassaSecretKeyEncrypted,
    yookassaWebhookAllowedIps: clean(input.yookassa.webhookAllowedIps),
    payAnyWayEnabled: input.payAnyWay.enabled,
    payAnyWayMerchantId: clean(input.payAnyWay.merchantId),
    payAnyWayIntegrityCodeEncrypted: input.payAnyWay.integrityCode?.trim()
      ? encryptPaymentSecret(input.payAnyWay.integrityCode.trim())
      : current?.payAnyWayIntegrityCodeEncrypted,
    payAnyWayTestMode: input.payAnyWay.testMode,
  }

  await prisma.paymentProviderSetting.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...data },
    update: data,
  })
  return getPublicPaymentProviderSettings()
}

export async function resetPaymentProviderSettings() {
  await prisma.paymentProviderSetting.deleteMany({ where: { id: 'default' } })
  return getPublicPaymentProviderSettings()
}

export function isResolvedYooKassaConfigured(settings: ResolvedPaymentProviderSettings) {
  return Boolean(settings.yookassa.enabled && settings.yookassa.shopId && settings.yookassa.secretKey)
}

export function isResolvedPayAnyWayConfigured(settings: ResolvedPaymentProviderSettings) {
  return Boolean(settings.payAnyWay.enabled && settings.payAnyWay.merchantId && settings.payAnyWay.integrityCode)
}

function toPublicSettings(settings: ResolvedPaymentProviderSettings): PublicPaymentProviderSettings {
  return {
    source: settings.source,
    yookassa: {
      enabled: settings.yookassa.enabled,
      configured: isResolvedYooKassaConfigured(settings),
      shopId: settings.yookassa.shopId,
      secretConfigured: Boolean(settings.yookassa.secretKey),
      webhookAllowedIps: settings.yookassa.webhookAllowedIps,
    },
    payAnyWay: {
      enabled: settings.payAnyWay.enabled,
      configured: isResolvedPayAnyWayConfigured(settings),
      merchantId: settings.payAnyWay.merchantId,
      integrityCodeConfigured: Boolean(settings.payAnyWay.integrityCode),
      testMode: settings.payAnyWay.testMode,
    },
  }
}

function env(name: string) {
  return process.env[name]?.trim() || ''
}

function envFlag(name: string, defaultValue: boolean) {
  const value = env(name)
  if (!value) return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function clean(value: string) {
  return value.trim() || null
}

function decryptStoredSecret(value: string, provider: 'yookassa' | 'payanyway') {
  try {
    return decryptPaymentSecret(value)
  } catch (error) {
    logWarn('payment_settings.decrypt_failed', {
      provider,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return ''
  }
}
