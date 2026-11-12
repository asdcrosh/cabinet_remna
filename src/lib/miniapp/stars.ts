import { miniAppEnabled } from './config'

export function starsEnabled() {
  return miniAppEnabled() && process.env.TELEGRAM_STARS_ENABLED === 'true'
}

export function starsRateKopecks() {
  const rate = Number(process.env.TELEGRAM_STARS_KOPECKS_PER_STAR)
  if (!Number.isSafeInteger(rate) || rate < 1 || rate > 100_000) throw new Error('Telegram Stars rate is not configured')
  return rate
}

export function starsForKopecks(amountKopecks: number, rate = starsRateKopecks()) {
  if (!Number.isSafeInteger(amountKopecks) || amountKopecks <= 0) throw new Error('Invalid Stars order amount')
  const amount = Math.ceil(amountKopecks / rate)
  if (amount < 1 || amount > 10_000) throw new Error('Stars order is outside the supported range')
  return amount
}

export function starsInvoicePayload(paymentId: string) {
  return `avp:${paymentId}`
}
