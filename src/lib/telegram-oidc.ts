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
