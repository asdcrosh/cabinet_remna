// Централизованный fetch-клиент: бросает ошибки с понятным message,
// опционально показывает toast. Используется во всех формах.

import { toast } from '@/components/ui/toaster'
import { isAdminErrorPresentationActive } from '@/lib/admin-error-report'

export interface ApiError {
  error: string
  details?: unknown
  requestId?: string
  retryAfter?: number
}

export type ApiFetchError = Error & {
  status: number
  data: ApiError | null
  retryAfter: number | null
}

const API_TIMEOUT_MS = 20_000
const API_GET_RETRY_DELAY_MS = 350

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Некорректный запрос. Проверьте введенные данные.',
  401: 'Нужно войти в кабинет заново.',
  403: 'Недостаточно прав для этого действия.',
  404: 'Запрошенные данные не найдены.',
  409: 'Действие конфликтует с текущим состоянием данных.',
  413: 'Файл или запрос слишком большой.',
  415: 'Неподдерживаемый формат данных.',
  422: 'Проверьте заполненные поля.',
  429: 'Слишком много запросов. Попробуйте позже.',
  500: 'Внутренняя ошибка сервера.',
  502: 'Внешний сервис временно недоступен.',
  503: 'Сервис временно недоступен.',
  504: 'Сервис не ответил вовремя.',
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const canRetry = method === 'GET' || method === 'HEAD'
  const attempts = canRetry ? 2 : 1
  let res: Response | null = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const timeoutSignal = AbortSignal.timeout(API_TIMEOUT_MS)
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal
    try {
      res = await fetch(path, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        },
        signal,
      })
      if (attempt + 1 < attempts && [502, 503, 504].includes(res.status)) {
        await waitBeforeRetry()
        continue
      }
      break
    } catch (error) {
      if (init.signal?.aborted) throw error
      if (attempt + 1 < attempts) {
        await waitBeforeRetry()
        continue
      }

      const message = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        ? 'Сервер не ответил вовремя. Попробуйте ещё раз.'
        : 'Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.'
      if (method !== 'GET' && method !== 'HEAD' && !isAdminPage()) toast(message)
      throw new Error(message)
    }
  }

  if (!res) throw new Error('Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.')
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const message = getApiErrorMessage(
      res.status,
      data,
      res.headers.get('x-request-id') || data?.requestId
    )
    if (init.method && init.method !== 'GET' && !isAdminPage()) toast(message)
    const retryAfterHeader = res.headers.get('retry-after')
    const parsedRetryAfter = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN
    const err = new Error(message) as ApiFetchError
    err.status = res.status
    err.data = data
    err.retryAfter = Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0
      ? Math.ceil(parsedRetryAfter)
      : null
    throw err
  }
  return data as T
}

function waitBeforeRetry() {
  return new Promise((resolve) => setTimeout(resolve, API_GET_RETRY_DELAY_MS))
}

export function isApiFetchError(error: unknown): error is ApiFetchError {
  return error instanceof Error
    && 'status' in error
    && typeof (error as { status?: unknown }).status === 'number'
}

function isAdminPage() {
  return typeof window !== 'undefined' && (
    window.location.pathname.startsWith('/dashboard/admin')
    || isAdminErrorPresentationActive()
  )
}

function getApiErrorMessage(status: number, data: any, requestId?: string | null) {
  const baseMessage = data && typeof data.error === 'string' && data.error.trim()
    ? data.error
    : STATUS_MESSAGES[status] ?? `Ошибка ${status}. Попробуйте повторить действие.`
  if (status < 500 || !requestId) return baseMessage
  return `${baseMessage} Код: ${requestId.slice(0, 8)}`
}
