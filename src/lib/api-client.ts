// Централизованный fetch-клиент: бросает ошибки с понятным message,
// опционально показывает toast. Используется во всех формах.

import { toast } from '@/components/ui/toaster'

export interface ApiError {
  error: string
  details?: unknown
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
    const message = (data && data.error) || `Ошибка ${res.status}`
    if (init.method && init.method !== 'GET') toast(message)
    const err = new Error(message) as Error & { status: number; data: any }
    err.status = res.status
    err.data = data
    throw err
  }
  return data as T
}
