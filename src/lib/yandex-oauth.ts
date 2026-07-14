import { randomBytes } from 'node:crypto'
import { getAppUrl } from './app-url'

const OAUTH_TIMEOUT_MS = 10_000

export const YANDEX_OAUTH_STATE_COOKIE = 'yandex_oauth_state'
export const YANDEX_OAUTH_NEXT_COOKIE = 'yandex_oauth_next'
export const YANDEX_OAUTH_REF_COOKIE = 'yandex_oauth_ref'

export interface YandexProfile {
  providerUserId: string
  email: string
  emailVerified: boolean
  name: string | null
  picture: string | null
}

interface YandexTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface YandexInfoResponse {
  id?: string
  default_email?: string
  emails?: string[]
  real_name?: string
  display_name?: string
  login?: string
  avatar_id?: string
  is_avatar_empty?: boolean
}

export function getYandexRedirectUri() {
  return new URL('/api/auth/yandex/callback', getAppUrl()).toString()
}

export function createYandexOAuthState() {
  return randomBytes(24).toString('base64url')
}

export function getYandexOAuthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  }
}

export function buildYandexAuthUrl(input: { state: string }) {
  const url = new URL('https://oauth.yandex.ru/authorize')
  url.searchParams.set('client_id', getYandexClientId())
  url.searchParams.set('redirect_uri', getYandexRedirectUri())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'login:email login:info')
  url.searchParams.set('state', input.state)
  return url
}

export async function exchangeYandexCode(code: string) {
  const response = await fetch('https://oauth.yandex.ru/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getYandexRedirectUri(),
      client_id: getYandexClientId(),
      client_secret: getYandexClientSecret(),
    }),
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  })

  const data = (await response.json().catch(() => null)) as YandexTokenResponse | null

  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || 'yandex_token_exchange_failed')
  }

  return { accessToken: data.access_token }
}

export async function fetchYandexProfile(accessToken: string): Promise<YandexProfile> {
  const response = await fetch('https://login.yandex.ru/info?format=json', {
    headers: { Authorization: `OAuth ${accessToken}` },
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  })

  const data = (await response.json().catch(() => null)) as YandexInfoResponse | null
  if (!response.ok || !data?.id) {
    throw new Error('yandex_profile_fetch_failed')
  }

  const email = (data.default_email || data.emails?.[0] || '').toLowerCase().trim()
  if (!email) {
    throw new Error('yandex_profile_missing_email')
  }

  return {
    providerUserId: data.id,
    email,
    emailVerified: true,
    name: data.real_name || data.display_name || data.login || null,
    picture: getYandexAvatarUrl(data),
  }
}

export function sanitizeOAuthNext(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

export function sanitizeOAuthReferral(value: string | null | undefined) {
  const code = value?.trim()
  if (!code) return ''
  return /^[A-Za-z0-9_-]{3,32}$/.test(code) ? code : ''
}

function getYandexAvatarUrl(data: YandexInfoResponse) {
  if (!data.avatar_id || data.is_avatar_empty) return null
  return `https://avatars.yandex.net/get-yapic/${data.avatar_id}/islands-200`
}

function getYandexClientId() {
  const value = process.env.YANDEX_CLIENT_ID?.trim()
  if (!value) throw new Error('YANDEX_CLIENT_ID is not configured')
  return value
}

function getYandexClientSecret() {
  const value = process.env.YANDEX_CLIENT_SECRET?.trim()
  if (!value) throw new Error('YANDEX_CLIENT_SECRET is not configured')
  return value
}
