import { createHash, timingSafeEqual } from 'node:crypto'
import { getResolvedPaymentProviderSettings, isResolvedPayAnyWayConfigured } from './payment-settings'

const PRODUCTION_PAYMENT_URL = 'https://www.payanyway.ru/assistant.htm'
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

export async function isPayAnyWayConfigured() {
  return isResolvedPayAnyWayConfigured(await getResolvedPaymentProviderSettings())
}

export async function createPayAnyWayPaymentRequest(input: {
  transactionId: string
  amountKopecks: number
  description: string
  subscriberId: string
  successUrl: string
  failUrl: string
  returnUrl: string
}) {
  const config = await getConfig()
  const amount = formatAmount(input.amountKopecks)
  const currency = 'RUB'
  const testMode = config.testMode ? '1' : '0'
  const subscriberId = input.subscriberId.trim()
  if (!subscriberId) throw new Error('PayAnyWay subscriber ID is required')
  const signaturePayload =
    config.merchantId +
    input.transactionId +
    amount +
    currency +
    subscriberId +
    testMode +
    config.integrityCode
  const fields: Record<string, string> = {
    MNT_ID: config.merchantId,
    MNT_TRANSACTION_ID: input.transactionId,
    MNT_AMOUNT: amount,
    MNT_CURRENCY_CODE: currency,
    MNT_TEST_MODE: testMode,
    MNT_DESCRIPTION: input.description.slice(0, 500),
    MNT_SUBSCRIBER_ID: subscriberId,
    MNT_SIGNATURE: md5(signaturePayload),
    MNT_SUCCESS_URL: input.successUrl,
    MNT_FAIL_URL: input.failUrl,
    MNT_RETURN_URL: input.returnUrl,
  }

  return {
    action: config.paymentUrl,
    fields,
    diagnostics: {
      source: config.source,
      secretLength: config.integrityCode.length,
      secretFingerprint: sha256(config.integrityCode).slice(0, 12),
      payloadFingerprint: sha256(signaturePayload).slice(0, 12),
    },
  }
}

export async function createPayAnyWayReceiptResponse(input: {
  merchantId: string
  transactionId: string
  amountKopecks: number
  itemName: string
  customerEmail: string
}) {
  const config = await getConfig()
  if (input.merchantId !== config.merchantId) {
    throw new Error('PayAnyWay receipt merchant mismatch')
  }

  const inventory = JSON.stringify([{
    name: sanitizeReceiptItemName(input.itemName),
    price: formatAmount(input.amountKopecks),
    quantity: '1',
    vatTag: '1105',
    pm: 'full_payment',
    po: 'service',
  }])
  const resultCode = '200'
  const signature = md5(
    resultCode + config.merchantId + input.transactionId + config.integrityCode
  )

  return `<?xml version="1.0" encoding="UTF-8"?>
<MNT_RESPONSE>
  <MNT_ID>${escapeXml(config.merchantId)}</MNT_ID>
  <MNT_TRANSACTION_ID>${escapeXml(input.transactionId)}</MNT_TRANSACTION_ID>
  <MNT_RESULT_CODE>${resultCode}</MNT_RESULT_CODE>
  <MNT_SIGNATURE>${signature}</MNT_SIGNATURE>
  <MNT_ATTRIBUTES>
    <ATTRIBUTE>
      <KEY>INVENTORY</KEY>
      <VALUE>${escapeXml(inventory)}</VALUE>
    </ATTRIBUTE>
    <ATTRIBUTE>
      <KEY>CUSTOMER</KEY>
      <VALUE>${escapeXml(input.customerEmail.trim())}</VALUE>
    </ATTRIBUTE>
  </MNT_ATTRIBUTES>
</MNT_RESPONSE>`
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

export async function verifyPayAnyWayCallback(callback: PayAnyWayCallback) {
  const config = await getConfig()
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

async function getConfig() {
  const { payAnyWay, source } = await getResolvedPaymentProviderSettings()
  if (!payAnyWay.merchantId || !payAnyWay.integrityCode) {
    throw new Error('PayAnyWay is not configured')
  }
  return {
    merchantId: payAnyWay.merchantId,
    integrityCode: payAnyWay.integrityCode,
    testMode: payAnyWay.testMode,
    paymentUrl: payAnyWay.paymentUrl || (payAnyWay.testMode ? TEST_PAYMENT_URL : PRODUCTION_PAYMENT_URL),
    source,
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

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function safeEqual(actual: string, expected: string) {
  if (!/^[a-f0-9]{32}$/.test(actual)) return false
  const actualBuffer = Buffer.from(actual, 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

function sanitizeReceiptItemName(value: string) {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s.,()\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, 128) || 'VPN подписка'
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
