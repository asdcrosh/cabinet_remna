// Типизированный клиент Remnawave Panel API.
// Документация: https://docs.rw/api
// Авторизация: статический Bearer-токен из админки (Remnawave → API Tokens).
//
// Используется ТОЛЬКО с сервера (Next.js API routes / Server Components),
// токен лежит в env и не должен попасть в браузер.

const BASE_URL = process.env.REMNAWAVE_BASE_URL?.replace(/\/$/, '')
const TOKEN = process.env.REMNAWAVE_TOKEN

if (!BASE_URL || !TOKEN) {
  // Не throw-аем на импорте: иначе `next build` падает, если env ещё не заполнен.
  // Бросим только в момент первого реального вызова.
  console.warn('[remnawave] REMNAWAVE_BASE_URL / REMNAWAVE_TOKEN не заданы — API вызовы упадут')
}

class RemnawaveError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message)
    this.name = 'RemnawaveError'
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!BASE_URL || !TOKEN) {
    throw new RemnawaveError(0, null, 'Remnawave client is not configured')
  }
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body
      ? JSON.stringify(body, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
      : undefined,
    // Remnawave API может отвечать не мгновенно — 10s достаточно.
    // Если нужно больше — Next.js: в `route.ts` можно обернуть.
    cache: 'no-store',
  })
  const text = await res.text()
  const data = text ? safeJson(text) : null
  if (!res.ok) {
    throw new RemnawaveError(res.status, data, `Remnawave ${method} ${path} → ${res.status}`)
  }
  return data as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// ----------------------------------------------------------------------
// Типы — по OpenAPI-спеке remnawave-panel (v2.x)
// Структура ответов обёрнута в { response: ... } — сохраняем как есть.
// ----------------------------------------------------------------------

export type UserStatus = 'ACTIVE' | 'DISABLED' | 'LIMITED' | 'EXPIRED'
export type TrafficLimitStrategy = 'NO_RESET' | 'DAY' | 'WEEK' | 'MONTH'

export interface CreateUserRequest {
  username: string                         // ^[a-zA-Z0-9_-]+$, 3-36
  expireAt: string                         // ISO date-time
  status?: UserStatus
  trafficLimitBytes?: number | bigint      // 0 = безлимит
  trafficLimitStrategy?: TrafficLimitStrategy
  description?: string
  tag?: string
  email?: string
  telegramId?: number
  hwidDeviceLimit?: number
  activeInternalSquads?: string[]
  externalSquadUuid?: string
}

export interface UpdateUserRequest {
  uuid?: string
  username?: string
  status?: UserStatus
  expireAt?: string
  trafficLimitBytes?: number | bigint
  trafficLimitStrategy?: TrafficLimitStrategy
  description?: string | null
  tag?: string
  telegramId?: number
  email?: string
  hwidDeviceLimit?: number
  activeInternalSquads?: string[]
  externalSquadUuid?: string
}

export interface UserResponse {
  uuid: string
  shortUuid: string
  username: string
  status: UserStatus
  usedTrafficBytes: string          // bigint в строке
  lifetimeUsedTrafficBytes: string
  trafficLimitBytes: string
  trafficLimitStrategy: TrafficLimitStrategy
  expireAt: string
  createdAt: string
  vlessUuid: string
  trojanPassword: string
  ssPassword: string
  tag?: string
  hwidDeviceLimit?: number
  email?: string
  telegramId?: number
  description?: string
}

export interface CreateUserResponse {
  response: UserResponse
}

export interface GetUserByUuidResponse {
  response: UserResponse
}

export interface SubscriptionLink {
  // сюда приходит ["vless://...", "trojan://..."]
  // точные ключи смотри в спеке; в общем случае — массив строк
  [key: string]: string
}

export interface GetSubscriptionInfoResponse {
  response: {
    isFound: boolean
    user: {
      shortUuid: string
      username: string
      daysLeft: number
      trafficUsed: string
      trafficLimit: string
      lifetimeTrafficUsed: string
      trafficUsedBytes: string
      trafficLimitBytes: string
      lifetimeTrafficUsedBytes: string
      expiresAt: string
      isActive: boolean
      userStatus: UserStatus
      trafficLimitStrategy: TrafficLimitStrategy
    }
    links: SubscriptionLink | string[]
    ssConfLinks?: Record<string, string>
    subscriptionUrl: string
    happ?: { cryptoLink: string }
  }
}

export interface DailyUsageRow {
  date: string         // "2026-06-12"
  bytes: string        // bigint в строке
}

export interface DailyUsageResponse {
  response: DailyUsageRow[]
}

export interface SubscriptionRequestRecord {
  // последние 24 обращения
  userAgent: string
  ip: string
  requestedAt: string
}

export interface HwidUserDevice {
  hwid: string
  userUuid?: string
  platform?: string
  osVersion?: string
  deviceModel?: string
  userAgent?: string
  requestIp?: string | null
  createdAt?: string
  updatedAt?: string
}

// ----------------------------------------------------------------------
// Методы
// ----------------------------------------------------------------------

export const remnawave = {
  // CRUD пользователей ----------------------------------------------------

  async createUser(input: CreateUserRequest) {
    return request<CreateUserResponse>('POST', '/api/users', input)
  },

  async getUserByUuid(uuid: string) {
    return request<GetUserByUuidResponse>('GET', `/api/users/${encodeURIComponent(uuid)}`)
  },

  async getUserByUsername(username: string) {
    return request<{ response: UserResponse }>(
      'GET',
      `/api/users/by-username/${encodeURIComponent(username)}`
    )
  },

  async updateUser(input: UpdateUserRequest) {
    return request<{ response: UserResponse }>('PATCH', '/api/users', input)
  },

  async deleteUser(uuid: string) {
    return request<{ response: { isDeleted: boolean } }>(
      'DELETE',
      `/api/users/${encodeURIComponent(uuid)}`
    )
  },

  // Действия ---------------------------------------------------------------

  async revokeSubscription(uuid: string) {
    return request<{ response: UserResponse }>(
      'POST',
      `/api/users/${encodeURIComponent(uuid)}/actions/revoke`
    )
  },

  async disableUser(uuid: string) {
    return request<{ response: UserResponse }>(
      'POST',
      `/api/users/${encodeURIComponent(uuid)}/actions/disable`
    )
  },

  async enableUser(uuid: string) {
    return request<{ response: UserResponse }>(
      'POST',
      `/api/users/${encodeURIComponent(uuid)}/actions/enable`
    )
  },

  async resetTraffic(uuid: string) {
    return request<{ response: UserResponse }>(
      'POST',
      `/api/users/${encodeURIComponent(uuid)}/actions/reset-traffic`
    )
  },

  // Подписки ---------------------------------------------------------------

  async getSubscriptionByUsername(username: string) {
    return request<GetSubscriptionInfoResponse>(
      'GET',
      `/api/subscriptions/by-username/${encodeURIComponent(username)}`
    )
  },

  async getSubscriptionByShortUuid(shortUuid: string) {
    return request<GetSubscriptionInfoResponse>(
      'GET',
      `/api/subscriptions/by-short-uuid/${encodeURIComponent(shortUuid)}`
    )
  },

  // Статистика -------------------------------------------------------------

  async getUsageRange(uuid: string, start: Date, end: Date) {
    const qs = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`
    return request<DailyUsageResponse>(
      'GET',
      `/api/users/stats/usage/${encodeURIComponent(uuid)}/range?${qs}`
    )
  },

  async getSubscriptionRequestHistory(uuid: string) {
    return request<{ response: SubscriptionRequestRecord[] }>(
      'GET',
      `/api/users/${encodeURIComponent(uuid)}/subscription-request-history`
    )
  },

  // HWID -------------------------------------------------------------------
  async getUserDevices(uuid: string) {
    return request<{ response: { total: number; devices: HwidUserDevice[] } }>(
      'GET',
      `/api/hwid/devices/${encodeURIComponent(uuid)}`
    )
  },

  async deleteUserDevice(uuid: string, hwid: string) {
    return request<{ response: HwidUserDevice[] }>(
      'POST',
      '/api/hwid/devices/delete',
      { userUuid: uuid, hwid }
    )
  },
}

export { RemnawaveError }
