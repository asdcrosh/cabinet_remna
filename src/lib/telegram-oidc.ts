import { createHash, randomBytes } from 'node:crypto'
import { getAppUrl } from './app-url'

export const TELEGRAM_OIDC_STATE_COOKIE = 'telegram_oidc_state'
export const TELEGRAM_OIDC_VERIFIER_COOKIE = 'telegram_oidc_verifier'

export function getTelegramRedirectUri() {
  return new URL('/api/me/telegram/oidc/callback', getAppUrl()).toString()
}

export function createTelegramOidcState() {
  return randomBytes(24).toString('base64url')
}

export function createTelegramCodeVerifier() {
  return randomBytes(32).toString('base64url')
}

export function createTelegramCodeChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function getTelegramOidcCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  }
}

export async function exchangeTelegramCode(code: string, codeVerifier: string) {
  const clientId = process.env.TELEGRAM_CLIENT_ID
  const clientSecret = process.env.TELEGRAM_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Telegram OIDC is not configured')

  const response = await fetch('https://oauth.telegram.org/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getTelegramRedirectUri(),
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const data = (await response.json().catch(() => null)) as { id_token?: unknown } | null
  if (!response.ok || typeof data?.id_token !== 'string' || !data.id_token) {
    throw new Error('Telegram code exchange failed')
  }
  return data.id_token
}
