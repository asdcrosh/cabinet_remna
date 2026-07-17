// Минимальный клиент ЮKassa: createPayment, getPayment, handleWebhook.
// API: https://yookassa.ru/developers/api
// Авторизация: Basic auth (shop_id:secret_key в base64).

import { logWarn } from './logger'
import { getResolvedPaymentProviderSettings, isResolvedYooKassaConfigured } from './payment-settings'

const BASE_URL = 'https://api.yookassa.ru/v3'
const REQUEST_TIMEOUT_MS = 15_000

export async function isYookassaConfigured() {
  return isResolvedYooKassaConfigured(await getResolvedPaymentProviderSettings())
}

// ---- Типы ---------------------------------------------------------------

export type PaymentStatus =
  | 'pending'
  | 'waiting_for_capture'
  | 'succeeded'
  | 'canceled'

export interface CreatePaymentInput {
  amount: number              // в рублях, с копейками (199.00)
  description: string
  returnUrl: string           // куда ЮKassa вернёт пользователя после оплаты
  metadata?: Record<string, string>
  // Идентификатор платежа в нашей системе (idempotency)
  // Помогает при ретрае webhook'а не задвоить подписку.
  idempotenceKey?: string
  // По умолчанию: списание сразу. Можно 'false' для двухстадийных платежей.
  capture?: boolean
  // Метод оплаты: SBP, BANK_CARD, и т.д. Если не указан — пользователь
  // увидит выбор на стороне ЮKassa.
  paymentMethodType?: 'bank_card' | 'sbp' | 'yoo_money' | 'sberbank'
}

export interface YooPayment {
  id: string
  status: PaymentStatus
  paid: boolean
  amount: { value: string; currency: string }
  confirmation?: { type: string; confirmation_url?: string }
  metadata?: Record<string, string>
  created_at: string
}

// ---- API ----------------------------------------------------------------

export async function createPayment(input: CreatePaymentInput): Promise<YooPayment> {
  const config = await getYooKassaConfig()
  const idempotenceKey =
    input.idempotenceKey ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  const body = {
    amount: {
      value: input.amount.toFixed(2),
      currency: 'RUB',
    },
    capture: input.capture ?? true,
    confirmation: {
      type: 'redirect',
      return_url: input.returnUrl,
    },
    description: input.description,
    metadata: input.metadata,
    ...(input.paymentMethodType
      ? { payment_method_data: { type: input.paymentMethodType } }
      : {}),
  }

  const res = await fetch(`${BASE_URL}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotenceKey,
      Authorization: authHeader(config.shopId, config.secretKey),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`YooKassa createPayment failed: ${res.status} ${text}`)
  }
  return (await res.json()) as YooPayment
}

export async function getPayment(id: string): Promise<YooPayment> {
  const config = await getYooKassaConfig()
  const res = await fetch(`${BASE_URL}/payments/${id}`, {
    headers: { Authorization: authHeader(config.shopId, config.secretKey) },
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`YooKassa getPayment failed: ${res.status} ${text}`)
  }
  return (await res.json()) as YooPayment
}

export async function cancelPayment(id: string, idempotenceKey = `cancel-${id}`): Promise<YooPayment> {
  const config = await getYooKassaConfig()
  const res = await fetch(`${BASE_URL}/payments/${id}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotenceKey,
      Authorization: authHeader(config.shopId, config.secretKey),
    },
    body: '{}',
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`YooKassa cancelPayment failed: ${res.status} ${text}`)
  }
  return (await res.json()) as YooPayment
}

async function getYooKassaConfig() {
  const { yookassa } = await getResolvedPaymentProviderSettings()
  if (!yookassa.shopId || !yookassa.secretKey) {
    logWarn('yookassa.missing_credentials', {
      hasShopId: Boolean(yookassa.shopId),
      hasSecretKey: Boolean(yookassa.secretKey),
    })
    throw new Error('YooKassa not configured')
  }
  return yookassa
}

function authHeader(shopId: string, secretKey: string) {
  return 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64')
}
