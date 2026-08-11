// Типизированный клиент Remnawave Panel API.
// Документация: https://docs.rw/api
// Авторизация: статический Bearer-токен из админки (Remnawave → API Tokens).
//
// Используется ТОЛЬКО с сервера (Next.js API routes / Server Components),
// токен лежит в env и не должен попасть в браузер.

import { logWarn } from './logger'

const BASE_URL = process.env.REMNAWAVE_BASE_URL?.replace(/\/$/, '')
const TOKEN = process.env.REMNAWAVE_TOKEN

if (!BASE_URL || !TOKEN) {
  // Не throw-аем на импорте: иначе `next build` падает, если env ещё не заполнен.
  // Бросим только в момент первого реального вызова.
  logWarn('remnawave.missing_credentials', { hasBaseUrl: Boolean(BASE_URL), hasToken: Boolean(TOKEN) })
}

export class RemnawaveError extends Error {
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
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  })
  const text = await res.text()
  const data = text ? safeJson(text) : null
  if (!res.ok) {
    throw new RemnawaveError(res.status, data, `Remnawave ${method} ${path} → ${res.status}: ${formatErrorBody(data)}`)
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

function formatErrorBody(data: unknown) {
  if (!data) return 'empty response'
  if (typeof data === 'string') return data.slice(0, 500)
  try {
    return JSON.stringify(data).slice(0, 500)
  } catch {
    return 'unserializable response'
  }
}

// ----------------------------------------------------------------------
// Типы — совместимый минимум OpenAPI Remnawave v2/v3.
// В v2 пользователь адресуется по UUID, в v3 — по numeric ID.
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
  telegramId?: number | string
  hwidDeviceLimit?: number
  activeInternalSquads?: string[]
  externalSquadUuid?: string
}

export interface UpdateUserRequest {
  username?: string
  status?: UserStatus
  expireAt?: string
  trafficLimitBytes?: number | bigint
  trafficLimitStrategy?: TrafficLimitStrategy
  description?: string | null
  tag?: string
  telegramId?: number | string
  email?: string
  hwidDeviceLimit?: number
  activeInternalSquads?: string[]
  externalSquadUuid?: string
}

export interface UserResponse {
  id?: number
  uuid?: string
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
  telegramId?: number | string
  description?: string
}

export interface CreateUserResponse {
  response: UserResponse
}

export interface GetUserByUuidResponse {
  response: UserResponse
}

export interface RemnawaveUserReference {
  id?: number | null
  uuid?: string | null
  username?: string | null
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

export interface DailyUsageResponse {
  response: {
    categories: string[]
    sparklineData: number[]
    series: Array<{
      uuid: string
      name: string
      color: string
      countryCode: string
      total: number
      data: number[]
    }>
  }
}

export interface SubscriptionRequestRecord {
  // последние 24 обращения
  userAgent: string
  ip: string
  requestedAt: string
}

export interface HwidUserDevice {
  hwid: string
  userId?: number
  userUuid?: string
  platform?: string
  osVersion?: string
  deviceModel?: string
  userAgent?: string
  requestIp?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface InternalSquadResponse {
  uuid?: string
  id?: string
  name?: string
  title?: string
  isActive?: boolean
  isDisabled?: boolean
  enabled?: boolean
  active?: boolean
}

export interface RemnawaveNodeInbound {
  uuid?: string
  tag?: string
  type?: string
  network?: string
  security?: string
  port?: number
  rawInbound?: {
    port?: number
    streamSettings?: {
      network?: string
      security?: string
      xhttpSettings?: {
        mode?: string
        path?: string
      }
      realitySettings?: {
        serverNames?: string[]
        target?: string
        dest?: string
      }
    }
  }
}

export interface RemnawaveNode {
  uuid: string
  id?: number
  name: string
  address: string
  countryCode?: string
  port?: number | null
  proxyUrl?: string | null
  isConnected: boolean
  isDisabled: boolean
  isConnecting?: boolean
  lastStatusChange?: string | null
  lastStatusMessage?: string | null
  isTrafficTrackingActive?: boolean
  trafficResetDay?: number | null
  trafficLimitBytes?: number | null
  trafficUsedBytes?: number | null
  notifyPercent?: number | null
  viewPosition?: number
  consumptionMultiplier?: number
  nodeConsumptionMultiplier?: number
  tags?: string[]
  createdAt?: string
  updatedAt?: string
  xrayUptime?: number | string
  usersOnline?: number
  configProfile?: {
    activeConfigProfileUuid?: string | null
    activeInbounds?: RemnawaveNodeInbound[]
  }
  providerUuid?: string | null
  provider?: unknown | null
  activePluginUuid?: string | null
  system?: {
    info?: {
      memoryTotal?: number | string
    }
    stats?: {
      memoryUsed?: number | string
      loadAvg?: number[]
      interface?: {
        rxBytesPerSec?: number
        txBytesPerSec?: number
      }
    }
  } | null
  versions?: {
    xray?: string
    node?: string
  } | null
  note?: string | null
}

export interface GetNodesResponse {
  response: RemnawaveNode[]
}

export interface CreateRemnawaveNodeRequest {
  name: string
  address: string
  port?: number
  proxyUrl?: string | null
  isTrafficTrackingActive?: boolean
  trafficLimitBytes?: number
  notifyPercent?: number
  trafficResetDay?: number
  countryCode?: string
  consumptionMultiplier?: number
  nodeConsumptionMultiplier?: number
  configProfile: {
    activeConfigProfileUuid: string
    activeInbounds: string[]
  }
  providerUuid?: string | null
  tags?: string[]
  activePluginUuid?: string | null
  note?: string
}

export interface CreateNodeResponse {
  response: RemnawaveNode
}

export interface GetNodeSecretResponse {
  response: {
    pubKey?: string
    secretKey?: string
  }
}

export type RemnawaveHostAlpn =
  | 'h3'
  | 'h2'
  | 'http/1.1'
  | 'h2,http/1.1'
  | 'h3,h2,http/1.1'
  | 'h3,h2'

export type RemnawaveHostSecurityLayer = 'DEFAULT' | 'TLS' | 'NONE'
export type RemnawaveMihomoIpVersion = 'dual' | 'ipv4' | 'ipv6' | 'ipv4-prefer' | 'ipv6-prefer'
export type RemnawaveSubscriptionTemplateType =
  | 'XRAY_JSON'
  | 'XRAY_BASE64'
  | 'MIHOMO'
  | 'STASH'
  | 'CLASH'
  | 'SINGBOX'

export interface RemnawaveHostInbound {
  configProfileUuid: string | null
  configProfileInboundUuid: string | null
}

export interface RemnawaveHost {
  uuid: string
  viewPosition?: number
  remark: string
  address: string
  port: number
  path?: string | null
  sni?: string | null
  host?: string | null
  alpn?: RemnawaveHostAlpn | null
  fingerprint?: string | null
  isDisabled: boolean
  securityLayer?: RemnawaveHostSecurityLayer
  xhttpExtraParams?: unknown | null
  muxParams?: unknown | null
  sockoptParams?: unknown | null
  finalMask?: unknown | null
  serverDescription?: string | null
  tags?: string[]
  isHidden?: boolean
  overrideSniFromAddress?: boolean
  keepSniBlank?: boolean
  pinnedPeerCertSha256?: string | null
  verifyPeerCertByName?: string | null
  vlessRouteId?: number | null
  shuffleHost?: boolean
  mihomoX25519?: boolean
  mihomoIpVersion?: RemnawaveMihomoIpVersion | null
  inbound: RemnawaveHostInbound
  nodes: string[]
  xrayJsonTemplateUuid?: string | null
  excludedInternalSquads?: string[]
  excludeFromSubscriptionTypes?: RemnawaveSubscriptionTemplateType[]
}

export interface GetHostsResponse {
  response: RemnawaveHost[]
}

export interface CreateRemnawaveHostRequest {
  inbound: {
    configProfileUuid: string
    configProfileInboundUuid: string
  }
  remark: string
  address: string
  port: number
  path?: string | null
  sni?: string | null
  host?: string | null
  alpn?: RemnawaveHostAlpn | null
  fingerprint?: string | null
  isDisabled?: boolean
  securityLayer?: RemnawaveHostSecurityLayer
  xhttpExtraParams?: unknown | null
  muxParams?: unknown | null
  sockoptParams?: unknown | null
  finalMask?: unknown | null
  serverDescription?: string | null
  tags?: string[]
  isHidden?: boolean
  overrideSniFromAddress?: boolean
  keepSniBlank?: boolean
  pinnedPeerCertSha256?: string | null
  verifyPeerCertByName?: string | null
  vlessRouteId?: number | null
  shuffleHost?: boolean
  mihomoX25519?: boolean
  mihomoIpVersion?: RemnawaveMihomoIpVersion | null
  nodes?: string[]
  xrayJsonTemplateUuid?: string | null
  excludedInternalSquads?: string[]
  excludeFromSubscriptionTypes?: RemnawaveSubscriptionTemplateType[]
}

export interface UpdateRemnawaveHostRequest extends Omit<Partial<CreateRemnawaveHostRequest>, 'inbound'> {
  uuid: string
  inbound?: CreateRemnawaveHostRequest['inbound']
}

export interface HostResponse {
  response: RemnawaveHost
}

export interface DeleteRemnawaveEntityResponse {
  response: {
    isDeleted: boolean
  }
}

const HOST_CLONE_OPTIONAL_FIELDS = [
  'path',
  'sni',
  'host',
  'alpn',
  'fingerprint',
  'isDisabled',
  'securityLayer',
  'xhttpExtraParams',
  'muxParams',
  'sockoptParams',
  'finalMask',
  'serverDescription',
  'tags',
  'isHidden',
  'overrideSniFromAddress',
  'keepSniBlank',
  'pinnedPeerCertSha256',
  'verifyPeerCertByName',
  'vlessRouteId',
  'shuffleHost',
  'mihomoX25519',
  'mihomoIpVersion',
  'nodes',
  'xrayJsonTemplateUuid',
  'excludedInternalSquads',
  'excludeFromSubscriptionTypes',
] as const satisfies readonly (keyof CreateRemnawaveHostRequest)[]

function pickHostCloneOptionalFields(source: object) {
  const result: Partial<CreateRemnawaveHostRequest> = {}
  const mutableResult = result as Record<string, unknown>
  const record = source as Record<string, unknown>
  for (const field of HOST_CLONE_OPTIONAL_FIELDS) {
    if (record[field] !== undefined) mutableResult[field] = record[field]
  }
  return result
}

/**
 * Creates a lossless host-create payload from an existing host while explicitly
 * excluding response-only fields such as uuid and viewPosition.
 */
export function buildHostCloneRequest(
  source: RemnawaveHost,
  overrides: Partial<CreateRemnawaveHostRequest> = {}
): CreateRemnawaveHostRequest {
  const inbound = overrides.inbound ?? (
    source.inbound.configProfileUuid && source.inbound.configProfileInboundUuid
      ? {
          configProfileUuid: source.inbound.configProfileUuid,
          configProfileInboundUuid: source.inbound.configProfileInboundUuid,
        }
      : null
  )
  if (!inbound) {
    throw new RemnawaveError(0, source, 'Remnawave host has no cloneable inbound reference')
  }

  const optionalFields = {
    ...pickHostCloneOptionalFields(source),
    ...pickHostCloneOptionalFields(overrides),
  }
  return {
    ...optionalFields,
    inbound,
    remark: overrides.remark ?? source.remark,
    address: overrides.address ?? source.address,
    port: overrides.port ?? source.port,
  }
}

// ----------------------------------------------------------------------
// Методы
// ----------------------------------------------------------------------

function hasNumericId(reference: RemnawaveUserReference) {
  return typeof reference.id === 'number' && Number.isSafeInteger(reference.id) && reference.id > 0
}

function hasUuid(reference: RemnawaveUserReference) {
  return typeof reference.uuid === 'string' && reference.uuid.trim().length > 0
}

function hasUsername(reference: RemnawaveUserReference) {
  return typeof reference.username === 'string' && reference.username.trim().length > 0
}

function isReferenceMismatch(error: unknown) {
  return error instanceof RemnawaveError && (error.status === 400 || error.status === 404)
}

function resolvedIdentifier(user: UserResponse) {
  if (user.uuid) return { key: user.uuid, body: { uuid: user.uuid } }
  if (typeof user.id === 'number' && Number.isSafeInteger(user.id) && user.id > 0) {
    return { key: String(user.id), body: { id: user.id } }
  }
  throw new RemnawaveError(0, user, 'Remnawave user response has neither numeric id nor uuid')
}

function resolvedHwidIdentifier(user: UserResponse) {
  if (user.uuid) return { userUuid: user.uuid }
  if (typeof user.id === 'number' && Number.isSafeInteger(user.id) && user.id > 0) {
    return { userId: user.id }
  }
  throw new RemnawaveError(0, user, 'Remnawave user response has neither numeric id nor uuid')
}

async function resolveUser(reference: RemnawaveUserReference): Promise<UserResponse> {
  if (hasUsername(reference)) {
    const data = await request<{ response: UserResponse }>(
      'GET',
      `/api/users/by-username/${encodeURIComponent(reference.username!.trim())}`
    )
    return data.response
  }

  let lastError: unknown
  if (hasNumericId(reference)) {
    try {
      const data = await request<{ response: UserResponse }>('GET', `/api/users/${reference.id}`)
      return data.response
    } catch (error) {
      lastError = error
      if (!hasUuid(reference) || !isReferenceMismatch(error)) throw error
    }
  }

  if (hasUuid(reference)) {
    try {
      const data = await request<{ response: UserResponse }>(
        'GET',
        `/api/users/${encodeURIComponent(reference.uuid!.trim())}`
      )
      return data.response
    } catch (error) {
      lastError = error
      throw error
    }
  }

  if (lastError) throw lastError
  throw new RemnawaveError(0, reference, 'Remnawave user reference is missing')
}

async function requestUserAction(
  reference: RemnawaveUserReference,
  action: 'revoke' | 'disable' | 'enable' | 'reset-traffic'
) {
  const user = await resolveUser(reference)
  const identifier = resolvedIdentifier(user)
  return request<{ response: UserResponse }>(
    'POST',
    `/api/users/${encodeURIComponent(identifier.key)}/actions/${action}`
  )
}

export function remnawaveUserReference(user: {
  remnawaveId?: number | null
  remnawaveUuid?: string | null
  remnawaveUsername?: string | null
}): RemnawaveUserReference {
  return {
    id: user.remnawaveId,
    uuid: user.remnawaveUuid,
    username: user.remnawaveUsername,
  }
}

export function hasRemnawaveUserReference(user: {
  remnawaveId?: number | null
  remnawaveUuid?: string | null
  remnawaveUsername?: string | null
}) {
  return hasNumericId({ id: user.remnawaveId }) ||
    hasUuid({ uuid: user.remnawaveUuid }) ||
    hasUsername({ username: user.remnawaveUsername })
}

export const remnawave = {
  async getNodes() {
    return request<GetNodesResponse>('GET', '/api/nodes')
  },

  async createNode(input: CreateRemnawaveNodeRequest) {
    return request<CreateNodeResponse>('POST', '/api/nodes', input)
  },

  async getNodeSecret() {
    return request<GetNodeSecretResponse>('GET', '/api/keygen')
  },

  async deleteNode(uuid: string) {
    return request<DeleteRemnawaveEntityResponse>('DELETE', `/api/nodes/${encodeURIComponent(uuid)}`)
  },

  async getHosts() {
    return request<GetHostsResponse>('GET', '/api/hosts')
  },

  async createHost(input: CreateRemnawaveHostRequest) {
    return request<HostResponse>('POST', '/api/hosts', input)
  },

  async updateHost(input: UpdateRemnawaveHostRequest) {
    return request<HostResponse>('PATCH', '/api/hosts', input)
  },

  async deleteHost(uuid: string) {
    return request<DeleteRemnawaveEntityResponse>('DELETE', `/api/hosts/${encodeURIComponent(uuid)}`)
  },

  // CRUD пользователей ----------------------------------------------------

  async createUser(input: CreateUserRequest) {
    return request<CreateUserResponse>('POST', '/api/users', input)
  },

  async getUser(reference: RemnawaveUserReference) {
    return { response: await resolveUser(reference) }
  },

  async getUserByUuid(uuid: string) {
    return { response: await resolveUser({ uuid }) } as GetUserByUuidResponse
  },

  async getUserByUsername(username: string) {
    return request<{ response: UserResponse }>(
      'GET',
      `/api/users/by-username/${encodeURIComponent(username)}`
    )
  },

  async updateUser(reference: RemnawaveUserReference, input: UpdateUserRequest) {
    const user = await resolveUser(reference)
    const identifier = resolvedIdentifier(user)
    return request<{ response: UserResponse }>('PATCH', '/api/users', {
      ...identifier.body,
      ...input,
    })
  },

  async getInternalSquads() {
    for (const path of ['/api/internal-squads', '/api/internal-squads/list', '/api/squads']) {
      try {
        return await request<unknown>('GET', path)
      } catch (error) {
        if (!(error instanceof RemnawaveError) || error.status !== 404) throw error
      }
    }
    throw new RemnawaveError(404, null, 'Remnawave internal squads endpoint not found')
  },

  async deleteUser(reference: RemnawaveUserReference) {
    const user = await resolveUser(reference)
    const identifier = resolvedIdentifier(user)
    return request<{ response: { isDeleted: boolean } } | null>(
      'DELETE',
      `/api/users/${encodeURIComponent(identifier.key)}`
    )
  },

  // Действия ---------------------------------------------------------------

  async revokeSubscription(reference: RemnawaveUserReference) {
    return requestUserAction(reference, 'revoke')
  },

  async disableUser(reference: RemnawaveUserReference) {
    return requestUserAction(reference, 'disable')
  },

  async enableUser(reference: RemnawaveUserReference) {
    return requestUserAction(reference, 'enable')
  },

  async resetTraffic(reference: RemnawaveUserReference) {
    return requestUserAction(reference, 'reset-traffic')
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

  async getUsageRange(reference: RemnawaveUserReference, start: Date, end: Date) {
    const user = await resolveUser(reference)
    const identifier = resolvedIdentifier(user)
    const qs = new URLSearchParams({
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      topNodesLimit: '20',
    })
    return request<DailyUsageResponse>(
      'GET',
      `/api/bandwidth-stats/users/${encodeURIComponent(identifier.key)}?${qs.toString()}`
    )
  },

  async getSubscriptionRequestHistory(reference: RemnawaveUserReference) {
    const user = await resolveUser(reference)
    const identifier = resolvedIdentifier(user)
    return request<{ response: SubscriptionRequestRecord[] }>(
      'GET',
      `/api/users/${encodeURIComponent(identifier.key)}/subscription-request-history`
    )
  },

  // HWID -------------------------------------------------------------------
  async getUserDevices(reference: RemnawaveUserReference) {
    const user = await resolveUser(reference)
    const identifier = resolvedIdentifier(user)
    return request<{ response: { total: number; devices: HwidUserDevice[] } }>(
      'GET',
      `/api/hwid/devices/${encodeURIComponent(identifier.key)}`
    )
  },

  async deleteUserDevice(reference: RemnawaveUserReference, hwid: string) {
    const user = await resolveUser(reference)
    const identifier = resolvedHwidIdentifier(user)
    return request<{ response: HwidUserDevice[] }>(
      'POST',
      '/api/hwid/devices/delete',
      { ...identifier, hwid }
    )
  },

  async deleteAllUserDevices(reference: RemnawaveUserReference) {
    const user = await resolveUser(reference)
    const identifier = resolvedHwidIdentifier(user)
    return request<{ response: unknown }>(
      'POST',
      '/api/hwid/devices/delete-all',
      identifier
    )
  },
}
