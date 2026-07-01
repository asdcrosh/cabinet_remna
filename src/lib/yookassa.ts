// Минимальный клиент ЮKassa: createPayment, getPayment, handleWebhook.
// API: https://yookassa.ru/developers/api
// Авторизация: Basic auth (shop_id:secret_key в base64).

import { logWarn } from './logger'

const SHOP_ID = process.env.YOOKASSA_SHOP_ID
const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY

if (!SHOP_ID || !SECRET_KEY) {
  logWarn('yookassa.missing_credentials', { hasShopId: Boolean(SHOP_ID), hasSecretKey: Boolean(SECRET_KEY) })
}

const BASE_URL = 'https://api.yookassa.ru/v3'

const authHeader = () =>
  'Basic ' + Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64')

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
  if (!SHOP_ID || !SECRET_KEY) throw new Error('YooKassa not configured')
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
      Authorization: authHeader(),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`YooKassa createPayment failed: ${res.status} ${text}`)
  }
  return (await res.json()) as YooPayment
}

export async function getPayment(id: string): Promise<YooPayment> {
  if (!SHOP_ID || !SECRET_KEY) throw new Error('YooKassa not configured')
  const res = await fetch(`${BASE_URL}/payments/${id}`, {
    headers: { Authorization: authHeader() },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`YooKassa getPayment failed: ${res.status} ${text}`)
  }
  return (await res.json()) as YooPayment
}

export async function cancelPayment(id: string, idempotenceKey = `cancel-${id}`): Promise<YooPayment> {
  if (!SHOP_ID || !SECRET_KEY) throw new Error('YooKassa not configured')
  const res = await fetch(`${BASE_URL}/payments/${id}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotenceKey,
      Authorization: authHeader(),
    },
    body: '{}',
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`YooKassa cancelPayment failed: ${res.status} ${text}`)
  }
  return (await res.json()) as YooPayment
}
