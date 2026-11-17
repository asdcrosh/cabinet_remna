import { createHmac, timingSafeEqual } from 'node:crypto'
import type { TelegramRubleMethod } from './model'

const methodFlags = {
  bot: { bank_card: 'TELEGRAM_BOT_CARD_ENABLED', sbp: 'TELEGRAM_BOT_SBP_ENABLED' },
  miniapp: { bank_card: 'TELEGRAM_MINIAPP_CARD_ENABLED', sbp: 'TELEGRAM_MINIAPP_SBP_ENABLED' },
} as const

export function telegramRubleMethods(channel: keyof typeof methodFlags): TelegramRubleMethod[] {
  return (Object.keys(methodFlags[channel]) as TelegramRubleMethod[])
    .filter(method => process.env[methodFlags[channel][method]] === 'true')
}

function signBotCheckout(userId: string, planId: string, expiresAt: number) {
  const secret = process.env.TELEGRAM_MINIAPP_WEBHOOK_SECRET
  if (!secret || secret.length < 32) return null
  return createHmac('sha256', secret)
    .update(JSON.stringify(['bot-checkout', userId, planId, expiresAt]))
    .digest('hex')
}

export function createBotCheckoutGrant(userId: string, planId: string) {
  const expiresAt = Date.now() + 15 * 60_000
  const signature = signBotCheckout(userId, planId, expiresAt)
  return signature ? `${expiresAt}.${signature}` : null
}

export function verifyBotCheckoutGrant(grant: string, userId: string, planId: string) {
  if (!/^\d{13}\.[a-f0-9]{64}$/.test(grant)) return false
  const [expiration, signature = ''] = grant.split('.')
  const expiresAt = Number(expiration)
  if (expiresAt <= Date.now()) return false
  const expected = signBotCheckout(userId, planId, expiresAt)
  return Boolean(expected && timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex')))
}
