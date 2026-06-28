// Централизованный fetch-клиент: бросает ошибки с понятным message,
// опционально показывает toast. Используется во всех формах.

import { toast } from '@/components/ui/toaster'

export interface ApiError {
  error: string
  details?: unknown
}

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
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const message = getApiErrorMessage(res.status, data)
    if (init.method && init.method !== 'GET') toast(message)
    const err = new Error(message) as Error & { status: number; data: any }
    err.status = res.status
    err.data = data
    throw err
  }
  return data as T
}

function getApiErrorMessage(status: number, data: any) {
  if (data && typeof data.error === 'string' && data.error.trim()) return data.error
  return STATUS_MESSAGES[status] ?? `Ошибка ${status}. Попробуйте повторить действие.`
}
