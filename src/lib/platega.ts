import { timingSafeEqual } from 'node:crypto'
import {
  getResolvedPaymentProviderSettings,
  isResolvedPlategaConfigured,
} from './payment-settings'

const BASE_URL = 'https://app.platega.io'
const REQUEST_TIMEOUT_MS = 15_000

export type PlategaPaymentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED' | 'CHARGEBACKED'

export type PlategaCreatePaymentResult = {
  transactionId: string
  status: PlategaPaymentStatus
  url: string
  expiresIn: string | null
}

export type PlategaTransaction = {
  id: string
  status: PlategaPaymentStatus
  paymentDetails: {
    amount: number
    currency: string
  }
  paymentMethod: string | number | null
  expiresIn: string | null
  payload: string | null
}

export async function isPlategaConfigured() {
  return isResolvedPlategaConfigured(await getResolvedPaymentProviderSettings())
}

export async function createPlategaPayment(input: {
  amountKopecks: number
  description: string
  returnUrl: string
  failedUrl: string
  payload: string
  metadata: {
    userId: string
    userName: string
  }
}): Promise<PlategaCreatePaymentResult> {
  if (!Number.isInteger(input.amountKopecks) || input.amountKopecks <= 0) {
    throw new Error('Platega amount must be a positive integer in kopecks')
  }

  const response = objectValue(await plategaRequest('/v2/transaction/process', {
    method: 'POST',
    body: JSON.stringify({
      paymentDetails: {
        amount: Number((input.amountKopecks / 100).toFixed(2)),
        currency: 'RUB',
      },
      description: input.description.slice(0, 500),
      return: input.returnUrl,
      failedUrl: input.failedUrl,
      payload: input.payload.slice(0, 1000),
      metadata: {
        userId: input.metadata.userId.slice(0, 200),
        userName: input.metadata.userName.slice(0, 200),
      },
    }),
  }))

  const transactionId = requiredString(response, 'transactionId')
  const url = requiredHttpsUrl(response, 'url')
  return {
    transactionId,
    url,
    status: paymentStatus(response.status),
    expiresIn: optionalString(response.expiresIn),
  }
}

export async function getPlategaTransaction(id: string): Promise<PlategaTransaction> {
  const response = objectValue(await plategaRequest(`/transaction/${encodeURIComponent(id)}`, {
    method: 'GET',
  }))
  const paymentDetails = objectValue(response.paymentDetails)
  const amount = Number(paymentDetails.amount)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Platega transaction returned an invalid amount')
  }

  return {
    id: requiredString(response, 'id'),
    status: paymentStatus(response.status),
    paymentDetails: {
      amount,
      currency: requiredString(paymentDetails, 'currency').toUpperCase(),
    },
    paymentMethod:
      typeof response.paymentMethod === 'string' || typeof response.paymentMethod === 'number'
        ? response.paymentMethod
        : null,
    expiresIn: optionalString(response.expiresIn),
    payload: optionalString(response.payload),
  }
}

export async function checkPlategaConnection() {
  const response = await plategaRequest('/balance/all', { method: 'GET' })
  if (!Array.isArray(response)) throw new Error('Platega balance response is invalid')
  return true
}

export async function verifyPlategaCallbackHeaders(request: Request) {
  const { platega } = await getResolvedPaymentProviderSettings()
  if (!platega.merchantId || !platega.secret) {
    return { ok: false as const, error: 'not_configured' }
  }

  const merchantId = request.headers.get('X-MerchantId')?.trim() ?? ''
  const secret = request.headers.get('X-Secret')?.trim() ?? ''
  if (!safeEqual(merchantId, platega.merchantId) || !safeEqual(secret, platega.secret)) {
    return { ok: false as const, error: 'invalid_credentials' }
  }
  return { ok: true as const }
}

async function plategaRequest(path: string, init: RequestInit) {
  const config = await getConfig()
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-MerchantId': config.merchantId,
      'X-Secret': config.secret,
      ...init.headers,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Platega API failed: ${response.status} ${text.slice(0, 1000)}`)
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('Platega API returned invalid JSON')
  }
}

async function getConfig() {
  const { platega } = await getResolvedPaymentProviderSettings()
  if (!platega.merchantId || !platega.secret) throw new Error('Platega not configured')
  return platega
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Platega API returned an invalid response')
  }
  return value as Record<string, unknown>
}

function requiredString(value: unknown, key: string) {
  const object = objectValue(value)
  const result = object[key]
  if (typeof result !== 'string' || !result.trim()) {
    throw new Error(`Platega API response is missing ${key}`)
  }
  return result.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requiredHttpsUrl(value: unknown, key: string) {
  const raw = requiredString(value, key)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`Platega API returned an invalid ${key}`)
  }
  if (url.protocol !== 'https:') throw new Error(`Platega API returned an insecure ${key}`)
  return url.toString()
}

function paymentStatus(value: unknown): PlategaPaymentStatus {
  const status = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (status === 'PENDING' || status === 'CONFIRMED' || status === 'CANCELED' || status === 'CHARGEBACKED') {
    return status
  }
  throw new Error(`Platega API returned an unknown status: ${status || 'empty'}`)
}

function safeEqual(value: string, expected: string) {
  const left = Buffer.from(value)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}
