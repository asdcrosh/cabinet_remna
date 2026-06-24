import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const MAX_AUTH_AGE_MS = 24 * 60 * 60 * 1000
const MAX_MINI_APP_AUTH_AGE_MS = 15 * 60 * 1000

export interface TelegramAuthPayload {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export interface TelegramOidcUser {
  id: bigint
  username: string | null
  name: string | null
}

export interface TelegramMiniAppUser {
  id: bigint
  username: string | null
  name: string | null
  languageCode: string | null
}

export function verifyTelegramMiniAppInitData(initData: string): TelegramMiniAppUser {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is not configured')
  if (!initData || initData.length > 16_384) throw new Error('Invalid Telegram Mini App data')

  const params = new URLSearchParams(initData)
  const receivedHash = params.get('hash')
  const authDate = Number(params.get('auth_date'))
  const rawUser = params.get('user')
  if (!receivedHash || !authDate || !rawUser) throw new Error('Invalid Telegram Mini App data')
  if (Math.abs(Date.now() - authDate * 1000) > MAX_MINI_APP_AUTH_AGE_MS) {
    throw new Error('Telegram Mini App data expired')
  }

  const checkString = Array.from(params.entries())
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expectedHash = createHmac('sha256', secretKey).update(checkString).digest('hex')
  const received = Buffer.from(receivedHash, 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error('Invalid Telegram Mini App signature')
  }

  const parsed = JSON.parse(rawUser) as {
    id?: number
    first_name?: string
    last_name?: string
    username?: string
    language_code?: string
  }
  if (!parsed.id || !Number.isSafeInteger(parsed.id)) throw new Error('Telegram user is missing')

  return {
    id: BigInt(parsed.id),
    username: parsed.username?.trim() || null,
    name: [parsed.first_name, parsed.last_name].filter(Boolean).join(' ').trim() || parsed.username || null,
    languageCode: parsed.language_code?.trim() || null,
  }
}

export function verifyTelegramAuthPayload(payload: TelegramAuthPayload) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured')
  }

  if (!payload.id || !payload.auth_date || !payload.hash) {
    return { ok: false as const, error: 'Invalid Telegram payload' }
  }

  const authDateMs = payload.auth_date * 1000
  if (Date.now() - authDateMs > MAX_AUTH_AGE_MS) {
    return { ok: false as const, error: 'Telegram auth payload expired' }
  }

  const receivedHash = payload.hash
  const checkString = Object.entries(payload)
    .filter(([key, value]) => key !== 'hash' && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = createHash('sha256').update(botToken).digest()
  const expectedHash = createHmac('sha256', secretKey).update(checkString).digest('hex')

  const received = Buffer.from(receivedHash, 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { ok: false as const, error: 'Invalid Telegram signature' }
  }

  return { ok: true as const }
}

export function getTelegramDisplayName(payload: TelegramAuthPayload) {
  return [payload.first_name, payload.last_name].filter(Boolean).join(' ').trim() || payload.username || null
}

const telegramJwks = createRemoteJWKSet(new URL('https://oauth.telegram.org/.well-known/jwks.json'))

export async function verifyTelegramIdToken(idToken: string): Promise<TelegramOidcUser> {
  const clientId = process.env.TELEGRAM_CLIENT_ID
  if (!clientId) {
    throw new Error('TELEGRAM_CLIENT_ID is not configured')
  }

  const { payload } = await jwtVerify(idToken, telegramJwks, {
    issuer: 'https://oauth.telegram.org',
    audience: clientId,
  })

  const rawId = payload.id ?? payload.sub
  if (typeof rawId !== 'string' && typeof rawId !== 'number') {
    throw new Error('Telegram ID token does not contain user id')
  }

  const username =
    typeof payload.preferred_username === 'string'
      ? payload.preferred_username
      : typeof payload.username === 'string'
        ? payload.username
        : null

  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : username

  return {
    id: BigInt(rawId),
    username,
    name,
  }
}
