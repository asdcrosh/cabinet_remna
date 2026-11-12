import { AuthError } from '@/lib/auth/guard'

export function miniAppEnabled() {
  return process.env.TELEGRAM_MINIAPP_ENABLED === 'true'
}

export function requireMiniApp() {
  if (!miniAppEnabled()) throw new AuthError(404, 'Not found')
}

export function miniAppBotToken() {
  const token = process.env.TELEGRAM_MINIAPP_BOT_TOKEN?.trim()
  if (!token) throw new Error('Mini App bot is not configured')
  return token
}

export function miniAppUrl() {
  const url = new URL('/miniapp', process.env.APP_URL)
  if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') throw new Error('HTTPS is required')
  return url.toString()
}
