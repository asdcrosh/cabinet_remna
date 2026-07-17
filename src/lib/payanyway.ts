import { createHash, timingSafeEqual } from 'node:crypto'

const PRODUCTION_PAYMENT_URL = 'https://moneta.ru/assistant.htm'
const TEST_PAYMENT_URL = 'https://demo.moneta.ru/assistant.htm'

export type PayAnyWayCallback = {
  merchantId: string
  transactionId: string
  operationId: string
  amount: string
  currency: string
  subscriberId: string
  testMode: string
  signature: string
}

export function isPayAnyWayEnabled() {
  return parseBoolean(process.env.PAYANYWAY_ENABLED)
}

export function isPayAnyWayConfigured() {
  return Boolean(
    isPayAnyWayEnabled() &&
    process.env.PAYANYWAY_MNT_ID?.trim() &&
    process.env.PAYANYWAY_INTEGRITY_CODE?.trim()
  )
}

export function createPayAnyWayPaymentUrl(input: {
  transactionId: string
  amountKopecks: number
  description: string
  subscriberId: string
  successUrl: string
  failUrl: string
  returnUrl: string
}) {
  const config = getConfig()
  const amount = formatAmount(input.amountKopecks)
  const currency = 'RUB'
  const testMode = config.testMode ? '1' : '0'
  const signature = md5(
    config.merchantId + input.transactionId + amount + currency + testMode + config.integrityCode
  )
  const params = new URLSearchParams({
    MNT_ID: config.merchantId,
    MNT_TRANSACTION_ID: input.transactionId,
    MNT_AMOUNT: amount,
    MNT_CURRENCY_CODE: currency,
    MNT_TEST_MODE: testMode,
    MNT_DESCRIPTION: input.description.slice(0, 500),
    MNT_SUBSCRIBER_ID: input.subscriberId,
    MNT_SIGNATURE: signature,
    MNT_SUCCESS_URL: input.successUrl,
    MNT_FAIL_URL: input.failUrl,
    MNT_RETURN_URL: input.returnUrl,
  })

  return `${config.paymentUrl}?${params.toString()}`
}

export function parsePayAnyWayCallback(params: URLSearchParams): PayAnyWayCallback | null {
  const callback = {
    merchantId: params.get('MNT_ID')?.trim() ?? '',
    transactionId: params.get('MNT_TRANSACTION_ID')?.trim() ?? '',
    operationId: params.get('MNT_OPERATION_ID')?.trim() ?? '',
    amount: params.get('MNT_AMOUNT')?.trim() ?? '',
    currency: params.get('MNT_CURRENCY_CODE')?.trim().toUpperCase() ?? '',
    subscriberId: params.get('MNT_SUBSCRIBER_ID')?.trim() ?? '',
    testMode: params.get('MNT_TEST_MODE')?.trim() ?? '',
    signature: params.get('MNT_SIGNATURE')?.trim().toLowerCase() ?? '',
  }

  if (!callback.merchantId && !callback.transactionId && !callback.signature) return null
  return callback
}

export function verifyPayAnyWayCallback(callback: PayAnyWayCallback) {
  const config = getConfig()
  if (callback.merchantId !== config.merchantId) return { ok: false as const, error: 'merchant_mismatch' }
  if (!callback.transactionId || !callback.operationId) return { ok: false as const, error: 'missing_payment_id' }
  if (callback.currency !== 'RUB') return { ok: false as const, error: 'currency_mismatch' }
  if (callback.testMode !== (config.testMode ? '1' : '0')) return { ok: false as const, error: 'test_mode_mismatch' }
  if (!/^\d+(?:\.\d{1,2})?$/.test(callback.amount)) return { ok: false as const, error: 'invalid_amount' }

  const expected = md5(
    callback.merchantId +
    callback.transactionId +
    callback.operationId +
    callback.amount +
    callback.currency +
    callback.subscriberId +
    callback.testMode +
    config.integrityCode
  )
  if (!safeEqual(callback.signature, expected)) return { ok: false as const, error: 'invalid_signature' }

  return { ok: true as const, amountKopecks: parseAmountKopecks(callback.amount) }
}

function getConfig() {
  const merchantId = process.env.PAYANYWAY_MNT_ID?.trim()
  const integrityCode = process.env.PAYANYWAY_INTEGRITY_CODE?.trim()
  if (!isPayAnyWayEnabled() || !merchantId || !integrityCode) {
    throw new Error('PayAnyWay is not configured')
  }
  const testMode = parseBoolean(process.env.PAYANYWAY_TEST_MODE)
  return {
    merchantId,
    integrityCode,
    testMode,
    paymentUrl: process.env.PAYANYWAY_PAYMENT_URL?.trim() || (testMode ? TEST_PAYMENT_URL : PRODUCTION_PAYMENT_URL),
  }
}

function formatAmount(amountKopecks: number) {
  if (!Number.isSafeInteger(amountKopecks) || amountKopecks <= 0) {
    throw new Error('PayAnyWay amount must be a positive integer')
  }
  return (amountKopecks / 100).toFixed(2)
}

function parseAmountKopecks(amount: string) {
  const [rubles, kopecks = ''] = amount.split('.')
  return Number(rubles) * 100 + Number(kopecks.padEnd(2, '0'))
}

function md5(value: string) {
  return createHash('md5').update(value, 'utf8').digest('hex')
}

function safeEqual(actual: string, expected: string) {
  if (!/^[a-f0-9]{32}$/.test(actual)) return false
  const actualBuffer = Buffer.from(actual, 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

function parseBoolean(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}
