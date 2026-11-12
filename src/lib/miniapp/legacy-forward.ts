// Transitional webhook bridge: old callbacks and conversations stay with the
// existing Remnashop dispatcher until their flows are fully migrated.
export async function forwardLegacyTelegramUpdate(raw: string) {
  const target = process.env.TELEGRAM_LEGACY_WEBHOOK_URL
  const secret = process.env.TELEGRAM_LEGACY_WEBHOOK_SECRET
  if (!target || !secret) return false
  const url = new URL(target)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Invalid legacy webhook URL')
  const own = new URL('/api/telegram-miniapp/webhook', process.env.APP_URL)
  if (url.toString() === own.toString()) throw new Error('Legacy webhook points to the Mini App')
  const response = await fetch(url, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': secret,
  }, body: raw, signal: AbortSignal.timeout(7_000), cache: 'no-store', redirect: 'error' })
  return response.ok
}
